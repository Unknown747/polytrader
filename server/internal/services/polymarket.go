package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"polymarket-trader/internal/models"
)

const gammaAPI = "https://gamma-api.polymarket.com"
const cacheTTL = 5 * time.Minute
const significantChangePct = 2.0

type marketCache struct {
	mu         sync.RWMutex
	markets    []models.NormalizedMarket
	ts         time.Time
	prevPrices map[string]float64
}

var mktCache = &marketCache{prevPrices: make(map[string]float64)}

type gammaMarket struct {
	ID            string      `json:"id"`
	Question      string      `json:"question"`
	ConditionID   string      `json:"conditionId"`
	EndDate       string      `json:"endDate"`
	Description   string      `json:"description"`
	OutcomePrices string      `json:"outcomePrices"`
	Volume        string      `json:"volume"`
	Active        bool        `json:"active"`
	Closed        bool        `json:"closed"`
	Archived      bool        `json:"archived"`
	Volume24hr    interface{} `json:"volume24hr"`
	Liquidity     interface{} `json:"liquidity"`
	ClobTokenIds  *string     `json:"clobTokenIds"`
	Tags          []struct {
		Label string `json:"label"`
	} `json:"tags"`
}

func parseFloat(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	}
	return 0
}

func parseOutcomePrices(raw string) (float64, float64) {
	var arr []string
	if err := json.Unmarshal([]byte(raw), &arr); err != nil || len(arr) < 2 {
		return 0.5, 0.5
	}
	yes, _ := strconv.ParseFloat(arr[0], 64)
	no, _ := strconv.ParseFloat(arr[1], 64)
	if yes == 0 {
		yes = 0.5
	}
	if no == 0 {
		no = 0.5
	}
	return yes, no
}

func parseTokenID(raw *string) string {
	if raw == nil {
		return ""
	}
	var arr []interface{}
	if err := json.Unmarshal([]byte(*raw), &arr); err != nil || len(arr) == 0 {
		return ""
	}
	if s, ok := arr[0].(string); ok {
		return s
	}
	return ""
}

func parseCategory(tags []struct{ Label string `json:"label"` }) string {
	if len(tags) == 0 {
		return "General"
	}
	l := tags[0].Label
	if len(l) == 0 {
		return "General"
	}
	return strings.ToUpper(l[:1]) + l[1:]
}

func parseDateSafe(raw string) string {
	if raw == "" {
		return time.Unix(0, 0).UTC().Format(time.RFC3339)
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05Z", raw)
		if err != nil {
			return time.Unix(0, 0).UTC().Format(time.RFC3339)
		}
	}
	return t.UTC().Format(time.RFC3339)
}

func NormalizeMarket(m gammaMarket) models.NormalizedMarket {
	yes, no := parseOutcomePrices(m.OutcomePrices)
	status := "closed"
	if m.Closed || m.Archived {
		status = "resolved"
	} else if m.Active {
		status = "active"
	}

	vol, _ := strconv.ParseFloat(m.Volume, 64)
	return models.NormalizedMarket{
		ID:              m.ID,
		Question:        m.Question,
		Category:        parseCategory(m.Tags),
		Status:          status,
		YesPrice:        yes,
		NoPrice:         no,
		Volume:          vol,
		Volume24h:       parseFloat(m.Volume24hr),
		Liquidity:       parseFloat(m.Liquidity),
		EndDate:         parseDateSafe(m.EndDate),
		ResolvedOutcome: nil,
		Description:     m.Description,
		ConditionID:     m.ConditionID,
		TokenID:         parseTokenID(m.ClobTokenIds),
	}
}

func fetchWithTimeout(rawURL string) ([]byte, int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var buf []byte
	tmp := make([]byte, 32*1024)
	for {
		n, err := resp.Body.Read(tmp)
		buf = append(buf, tmp[:n]...)
		if err != nil {
			break
		}
	}
	return buf, resp.StatusCode, nil
}

func fetchMarkets(active bool, limit, offset int) ([]gammaMarket, error) {
	params := url.Values{}
	params.Set("limit", strconv.Itoa(limit))
	params.Set("offset", strconv.Itoa(offset))
	if active {
		params.Set("active", "true")
	}
	u := fmt.Sprintf("%s/markets?%s", gammaAPI, params.Encode())

	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		body, code, err := fetchWithTimeout(u)
		if err == nil && code < 400 {
			var markets []gammaMarket
			if err2 := json.Unmarshal(body, &markets); err2 != nil {
				return nil, err2
			}
			return markets, nil
		}
		lastErr = err
		if code >= 400 && code < 500 {
			break
		}
		if attempt < 3 {
			time.Sleep(time.Duration(attempt*600) * time.Millisecond)
		}
	}
	return nil, lastErr
}

func fetchAllActiveMarkets() ([]gammaMarket, error) {
	pageSize := 200
	var all []gammaMarket
	for page := 0; page < 5; page++ {
		batch, err := fetchMarkets(true, pageSize, page*pageSize)
		if err != nil {
			log.Printf("Gamma API page %d failed: %v", page, err)
			break
		}
		if len(batch) == 0 {
			break
		}
		all = append(all, batch...)
		if len(batch) < pageSize {
			break
		}
	}
	return all, nil
}

func FetchMarketByID(id string) (*models.NormalizedMarket, error) {
	u := fmt.Sprintf("%s/markets/%s", gammaAPI, id)
	for attempt := 1; attempt <= 2; attempt++ {
		body, _, err := fetchWithTimeout(u)
		if err != nil {
			continue
		}
		var gm gammaMarket
		if err2 := json.Unmarshal(body, &gm); err2 != nil {
			return nil, err2
		}
		nm := NormalizeMarket(gm)
		return &nm, nil
	}
	return nil, fmt.Errorf("market not found")
}

func GetCachedMarkets() ([]models.NormalizedMarket, error) {
	mktCache.mu.RLock()
	if !mktCache.ts.IsZero() && time.Since(mktCache.ts) < cacheTTL {
		markets := mktCache.markets
		mktCache.mu.RUnlock()
		return markets, nil
	}
	mktCache.mu.RUnlock()

	mktCache.mu.Lock()
	defer mktCache.mu.Unlock()

	if !mktCache.ts.IsZero() && time.Since(mktCache.ts) < cacheTTL {
		return mktCache.markets, nil
	}

	raw, err := fetchAllActiveMarkets()
	if err != nil {
		return nil, err
	}

	var markets []models.NormalizedMarket
	for _, m := range raw {
		if !m.Archived {
			markets = append(markets, NormalizeMarket(m))
		}
	}

	newPrices := make(map[string]float64)
	var movers int
	for _, m := range markets {
		newPrices[m.ID] = m.YesPrice
		if prev, ok := mktCache.prevPrices[m.ID]; ok && prev > 0 {
			chg := math.Abs((m.YesPrice-prev)/prev) * 100
			if chg >= significantChangePct {
				movers++
			}
		}
	}

	log.Printf("Markets cache refreshed: total=%d significant_movers=%d", len(markets), movers)
	mktCache.markets = markets
	mktCache.ts = time.Now()
	mktCache.prevPrices = newPrices
	return markets, nil
}

func InvalidateCache() {
	mktCache.mu.Lock()
	defer mktCache.mu.Unlock()
	mktCache.ts = time.Time{}
}

func GetCachedPrevPrices() map[string]float64 {
	mktCache.mu.RLock()
	defer mktCache.mu.RUnlock()
	cp := make(map[string]float64, len(mktCache.prevPrices))
	for k, v := range mktCache.prevPrices {
		cp[k] = v
	}
	return cp
}

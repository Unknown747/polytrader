package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"polymarket-trader/internal/db"
)

const clobURL = "https://clob.polymarket.com"

type clobCredentials struct {
	PrivateKey    string
	APIKey        string
	APISecret     string
	APIPassphrase string
}

func getClobCred(key string) string {
	env := os.Getenv(key)
	if env != "" {
		return env
	}
	return db.GetCred(key)
}

func getCreds() *clobCredentials {
	pk := getClobCred("POLYMARKET_PRIVATE_KEY")
	apiKey := getClobCred("POLYMARKET_API_KEY")
	apiSecret := getClobCred("POLYMARKET_API_SECRET")
	apiPassphrase := getClobCred("POLYMARKET_API_PASSPHRASE")
	if pk == "" || apiKey == "" || apiSecret == "" || apiPassphrase == "" {
		return nil
	}
	return &clobCredentials{pk, apiKey, apiSecret, apiPassphrase}
}

func IsClobConfigured() bool {
	return getCreds() != nil
}

func GetWalletAddress() string {
	pk := getClobCred("POLYMARKET_PRIVATE_KEY")
	if pk == "" {
		return ""
	}
	return deriveAddress(pk)
}

func deriveAddress(privateKey string) string {
	if len(privateKey) < 64 {
		return ""
	}
	return "0x" + privateKey[:10] + "..." + privateKey[len(privateKey)-4:]
}

func buildL2AuthHeaders(creds *clobCredentials, method, path, body string) map[string]string {
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	msg := timestamp + method + path + body
	mac := hmac.New(sha256.New, []byte(creds.APISecret))
	mac.Write([]byte(msg))
	sig := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return map[string]string{
		"Content-Type":    "application/json",
		"POLY_ADDRESS":    GetWalletAddress(),
		"POLY_SIGNATURE":  sig,
		"POLY_TIMESTAMP":  timestamp,
		"POLY_API_KEY":    creds.APIKey,
		"POLY_PASSPHRASE": creds.APIPassphrase,
	}
}

func clobRequest(method, path string, bodyData interface{}) ([]byte, int, error) {
	creds := getCreds()
	if creds == nil {
		return nil, 0, fmt.Errorf("CLOB not configured")
	}

	var bodyStr string
	var bodyReader io.Reader
	if bodyData != nil {
		b, _ := json.Marshal(bodyData)
		bodyStr = string(b)
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, clobURL+path, bodyReader)
	if err != nil {
		return nil, 0, err
	}

	headers := buildL2AuthHeaders(creds, method, path, bodyStr)
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

func GetUsdcBalance() (float64, error) {
	creds := getCreds()
	if creds == nil {
		return 0, nil
	}
	address := GetWalletAddress()
	path := fmt.Sprintf("/balance?address=%s", address)
	data, code, err := clobRequest("GET", path, nil)
	if err != nil || code != 200 {
		return 0, err
	}
	var result struct {
		Balance string `json:"balance"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return 0, err
	}
	bal, _ := strconv.ParseFloat(result.Balance, 64)
	return bal, nil
}

type PlaceOrderParams struct {
	TokenID  string
	Side     string
	Price    float64
	Amount   float64
	Question string
}

func PlaceOrder(params PlaceOrderParams) (bool, string, string) {
	creds := getCreds()
	if creds == nil {
		return false, "", "Polymarket credentials not configured"
	}

	salt := make([]byte, 16)
	rand.Read(salt)
	saltHex := fmt.Sprintf("%x", salt)

	address := GetWalletAddress()
	usdcDecimals := 1000000
	usdcAmount := int64(params.Amount * float64(usdcDecimals))
	priceScaled := int64(params.Price * float64(usdcDecimals))

	var makerAmount, takerAmount int64
	if params.Side == "BUY" {
		makerAmount = usdcAmount
		takerAmount = usdcAmount * int64(usdcDecimals) / priceScaled
	} else {
		makerAmount = usdcAmount
		takerAmount = usdcAmount * priceScaled / int64(usdcDecimals)
	}

	orderBody := map[string]interface{}{
		"order": map[string]interface{}{
			"salt":          saltHex,
			"maker":         address,
			"signer":        address,
			"taker":         "0x0000000000000000000000000000000000000000",
			"tokenId":       params.TokenID,
			"makerAmount":   strconv.FormatInt(makerAmount, 10),
			"takerAmount":   strconv.FormatInt(takerAmount, 10),
			"expiration":    "0",
			"nonce":         "0",
			"feeRateBps":    "0",
			"side":          params.Side,
			"signatureType": 0,
			"signature":     "0x",
		},
		"owner":     creds.APIKey,
		"orderType": "GTC",
	}

	data, code, err := clobRequest("POST", "/order", orderBody)
	if err != nil {
		log.Printf("CLOB request failed: %v", err)
		return false, "", err.Error()
	}
	if code != 200 {
		log.Printf("CLOB order failed: HTTP %d, %s", code, string(data))
		return false, "", fmt.Sprintf("CLOB API error: %d", code)
	}

	var result struct {
		OrderID  string `json:"orderID"`
		Success  *bool  `json:"success"`
		ErrorMsg string `json:"errorMsg"`
	}
	json.Unmarshal(data, &result)
	if result.Success != nil && !*result.Success {
		return false, "", result.ErrorMsg
	}
	log.Printf("CLOB order placed: %s", result.OrderID)
	return true, result.OrderID, ""
}

type ClobTrade struct {
	TradeID    string  `json:"tradeId"`
	TokenID    string  `json:"tokenId"`
	Side       string  `json:"side"`
	Price      float64 `json:"price"`
	Size       float64 `json:"size"`
	UsdcAmount float64 `json:"usdcAmount"`
	Timestamp  string  `json:"timestamp"`
}

func GetFilledTrades() []ClobTrade {
	creds := getCreds()
	if creds == nil {
		return nil
	}
	address := GetWalletAddress()
	path := fmt.Sprintf("/data/trades?maker=%s&status=MATCHED&limit=100", address)
	data, code, err := clobRequest("GET", path, nil)
	if err != nil || code != 200 {
		return nil
	}
	var result struct {
		Data []struct {
			ID        string `json:"id"`
			AssetID   string `json:"asset_id"`
			Side      string `json:"side"`
			Price     string `json:"price"`
			Size      string `json:"size"`
			MatchTime string `json:"match_time"`
		} `json:"data"`
	}
	json.Unmarshal(data, &result)
	var trades []ClobTrade
	for _, t := range result.Data {
		price, _ := strconv.ParseFloat(t.Price, 64)
		size, _ := strconv.ParseFloat(t.Size, 64)
		trades = append(trades, ClobTrade{
			TradeID:    t.ID,
			TokenID:    t.AssetID,
			Side:       t.Side,
			Price:      price,
			Size:       size,
			UsdcAmount: price * size,
			Timestamp:  t.MatchTime,
		})
	}
	return trades
}

type ClobPosition struct {
	TokenID      string  `json:"tokenId"`
	Size         float64 `json:"size"`
	AvgPrice     float64 `json:"avgPrice"`
	CurrentPrice float64 `json:"currentPrice"`
	Value        float64 `json:"value"`
	Cost         float64 `json:"cost"`
	Pnl          float64 `json:"pnl"`
	PnlPercent   float64 `json:"pnlPercent"`
}

func GetLivePositions() []ClobPosition {
	creds := getCreds()
	if creds == nil {
		return nil
	}
	address := GetWalletAddress()
	path := fmt.Sprintf("/positions?user=%s", address)
	data, code, err := clobRequest("GET", path, nil)
	if err != nil || code != 200 {
		return nil
	}
	var result []struct {
		AssetID  string `json:"asset_id"`
		Size     string `json:"size"`
		AvgPrice string `json:"avg_price"`
		CurPrice string `json:"cur_price"`
		Value    string `json:"value"`
		Cost     string `json:"cost"`
	}
	json.Unmarshal(data, &result)
	var positions []ClobPosition
	for _, p := range result {
		size, _ := strconv.ParseFloat(p.Size, 64)
		avg, _ := strconv.ParseFloat(p.AvgPrice, 64)
		cur, _ := strconv.ParseFloat(p.CurPrice, 64)
		cost, _ := strconv.ParseFloat(p.Cost, 64)
		if cost == 0 {
			cost = size * avg
		}
		value, _ := strconv.ParseFloat(p.Value, 64)
		if value == 0 {
			value = size * cur
		}
		pnl := value - cost
		pnlPct := 0.0
		if cost > 0 {
			pnlPct = pnl / cost * 100
		}
		positions = append(positions, ClobPosition{
			TokenID:      p.AssetID,
			Size:         size,
			AvgPrice:     avg,
			CurrentPrice: cur,
			Value:        value,
			Cost:         cost,
			Pnl:          pnl,
			PnlPercent:   pnlPct,
		})
	}
	return positions
}

type OpenOrder struct {
	ID           string  `json:"id"`
	Market       string  `json:"market"`
	Side         string  `json:"side"`
	Price        float64 `json:"price"`
	OriginalSize float64 `json:"originalSize"`
	SizeMatched  float64 `json:"sizeMatched"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"createdAt"`
}

func GetOpenOrders() []OpenOrder {
	creds := getCreds()
	if creds == nil {
		return nil
	}
	address := GetWalletAddress()
	path := fmt.Sprintf("/orders?maker=%s&status=OPEN", address)
	data, code, err := clobRequest("GET", path, nil)
	if err != nil || code != 200 {
		return nil
	}
	var result struct {
		Data []struct {
			ID           string `json:"id"`
			AssetID      string `json:"asset_id"`
			Side         string `json:"side"`
			Price        string `json:"price"`
			OriginalSize string `json:"original_size"`
			SizeMatched  string `json:"size_matched"`
			Status       string `json:"status"`
			CreatedAt    string `json:"created_at"`
		} `json:"data"`
	}
	json.Unmarshal(data, &result)
	var orders []OpenOrder
	for _, o := range result.Data {
		price, _ := strconv.ParseFloat(o.Price, 64)
		origSize, _ := strconv.ParseFloat(o.OriginalSize, 64)
		sizeMatched, _ := strconv.ParseFloat(o.SizeMatched, 64)
		orders = append(orders, OpenOrder{
			ID:           o.ID,
			Market:       o.AssetID,
			Side:         o.Side,
			Price:        price,
			OriginalSize: origSize,
			SizeMatched:  sizeMatched,
			Status:       o.Status,
			CreatedAt:    o.CreatedAt,
		})
	}
	return orders
}

func CancelOrder(orderID string) (bool, string) {
	_, code, err := clobRequest("DELETE", "/order", map[string]string{"orderID": orderID})
	if err != nil {
		return false, err.Error()
	}
	if code != 200 {
		return false, fmt.Sprintf("HTTP %d", code)
	}
	return true, ""
}

func CancelAllOrders() (int, int) {
	orders := GetOpenOrders()
	cancelled, errors := 0, 0
	for _, o := range orders {
		ok, _ := CancelOrder(o.ID)
		if ok {
			cancelled++
		} else {
			errors++
		}
		time.Sleep(200 * time.Millisecond)
	}
	return cancelled, errors
}

func ComputeLivePnlHistory(trades []ClobTrade) []map[string]interface{} {
	byDate := make(map[string]struct {
		Pnl   float64
		Count int
	})
	for _, t := range trades {
		date := ""
		if len(t.Timestamp) >= 10 {
			date = t.Timestamp[:10]
		}
		existing := byDate[date]
		realized := -t.UsdcAmount
		if t.Side == "SELL" {
			realized = t.UsdcAmount
		}
		byDate[date] = struct {
			Pnl   float64
			Count int
		}{existing.Pnl + realized, existing.Count + 1}
	}

	var sorted []string
	for d := range byDate {
		sorted = append(sorted, d)
	}
	for i := 1; i < len(sorted); i++ {
		for j := i; j > 0 && sorted[j] < sorted[j-1]; j-- {
			sorted[j], sorted[j-1] = sorted[j-1], sorted[j]
		}
	}

	cumulative := 0.0
	var result []map[string]interface{}
	for _, date := range sorted {
		entry := byDate[date]
		cumulative += entry.Pnl
		result = append(result, map[string]interface{}{
			"date":       date,
			"pnl":        entry.Pnl,
			"cumulative": cumulative,
			"tradeCount": entry.Count,
		})
	}
	return result
}

func GetAutoTraderStats(cfg interface{}) map[string]interface{} {
	os.Getenv("_unused")
	return map[string]interface{}{
		"enabled":            false,
		"clobConfigured":     IsClobConfigured(),
		"tradesToday":        TradesToday(),
		"maxDailyTrades":     5,
		"remainingSlots":     5,
		"totalTradesLifetime": 0,
		"lastScanAt":         nil,
		"lastTradeAt":        nil,
		"usdcBalance":        0,
		"recentTrades":       []interface{}{},
		"emergencyStop":      IsEmergencyStop(),
		"consecutiveLosses":  GetConsecutiveLosses(),
		"cooldownUntil":      nil,
	}
}

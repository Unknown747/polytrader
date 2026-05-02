package models

type NormalizedMarket struct {
	ID              string  `json:"id"`
	Question        string  `json:"question"`
	Category        string  `json:"category"`
	Status          string  `json:"status"`
	YesPrice        float64 `json:"yesPrice"`
	NoPrice         float64 `json:"noPrice"`
	Volume          float64 `json:"volume"`
	Volume24h       float64 `json:"volume24h"`
	Liquidity       float64 `json:"liquidity"`
	EndDate         string  `json:"endDate"`
	ResolvedOutcome *string `json:"resolvedOutcome"`
	Description     string  `json:"description"`
	ConditionID     string  `json:"conditionId"`
	TokenID         string  `json:"tokenId"`
}

type Opportunity struct {
	MarketID           string  `json:"marketId"`
	Question           string  `json:"question"`
	Category           string  `json:"category"`
	RecommendedSide    string  `json:"recommendedSide"`
	CurrentPrice       float64 `json:"currentPrice"`
	EstimatedFairValue float64 `json:"estimatedFairValue"`
	Edge               float64 `json:"edge"`
	ExpectedReturn     float64 `json:"expectedReturn"`
	KellyFraction      float64 `json:"kellyFraction"`
	SuggestedAmount    float64 `json:"suggestedAmount"`
	RiskLevel          string  `json:"riskLevel"`
	DaysToResolution   float64 `json:"daysToResolution"`
	Volume24h          float64 `json:"volume24h"`
	Liquidity          float64 `json:"liquidity"`
	CompositeScore     float64 `json:"compositeScore"`
	Rationale          string  `json:"rationale"`
	ConditionID        string  `json:"conditionId"`
	PriceTrend         string  `json:"priceTrend"`
}

type StrategyConfig struct {
	AutoTradingEnabled      bool    `json:"autoTradingEnabled"`
	Bankroll                float64 `json:"bankroll"`
	MaxPositionPct          float64 `json:"maxPositionPct"`
	MinEdge                 float64 `json:"minEdge"`
	MinProbability          float64 `json:"minProbability"`
	MaxDaysToResolution     float64 `json:"maxDaysToResolution"`
	MinVolume24h            float64 `json:"minVolume24h"`
	MinLiquidity            float64 `json:"minLiquidity"`
	ScanIntervalMinutes     float64 `json:"scanIntervalMinutes"`
	TelegramAlertsEnabled   bool    `json:"telegramAlertsEnabled"`
	MaxDailyTrades          int     `json:"maxDailyTrades"`
	MaxOpportunities        int     `json:"maxOpportunities"`
	DailyReportHour         int     `json:"dailyReportHour"`
	StopLossPct             float64 `json:"stopLossPct"`
	StopLossAutoExecute     bool    `json:"stopLossAutoExecute"`
	TakeProfitEnabled       bool    `json:"takeProfitEnabled"`
	TakeProfitTier1Pct      float64 `json:"takeProfitTier1Pct"`
	TakeProfitTier2Pct      float64 `json:"takeProfitTier2Pct"`
	TakeProfitTier3Pct      float64 `json:"takeProfitTier3Pct"`
	TrendFilterEnabled      bool    `json:"trendFilterEnabled"`
	AutoCapital             bool    `json:"autoCapital"`
	AutoCompound            bool    `json:"autoCompound"`
	CategoryFilter          string  `json:"categoryFilter"`
	PaperTradingMode        bool    `json:"paperTradingMode"`
	PaperBankroll           float64 `json:"paperBankroll"`
	PaperSlippagePct        float64 `json:"paperSlippagePct"`
	PaperTakerFeePct        float64 `json:"paperTakerFeePct"`
	VolatilityCheckEnabled  bool    `json:"volatilityCheckEnabled"`
	VolatilityThresholdPct  float64 `json:"volatilityThresholdPct"`
	CooldownAfterLossEnabled bool   `json:"cooldownAfterLossEnabled"`
	MaxRiskPerTradePct      float64 `json:"maxRiskPerTradePct"`
}

var DefaultConfig = StrategyConfig{
	AutoTradingEnabled:      false,
	Bankroll:                100,
	MaxPositionPct:          5,
	MinEdge:                 0.03,
	MinProbability:          0.75,
	MaxDaysToResolution:     21,
	MinVolume24h:            500,
	MinLiquidity:            1000,
	ScanIntervalMinutes:     15,
	TelegramAlertsEnabled:   false,
	MaxDailyTrades:          5,
	MaxOpportunities:        30,
	DailyReportHour:         8,
	StopLossPct:             15,
	StopLossAutoExecute:     true,
	TakeProfitEnabled:       true,
	TakeProfitTier1Pct:      30,
	TakeProfitTier2Pct:      50,
	TakeProfitTier3Pct:      100,
	TrendFilterEnabled:      true,
	AutoCapital:             false,
	AutoCompound:            false,
	CategoryFilter:          "",
	PaperTradingMode:        false,
	PaperBankroll:           1000,
	PaperSlippagePct:        0.75,
	PaperTakerFeePct:        1.0,
	VolatilityCheckEnabled:  false,
	VolatilityThresholdPct:  5,
	CooldownAfterLossEnabled: false,
	MaxRiskPerTradePct:      5,
}

type OrderEntry struct {
	ID             string  `json:"id"`
	MarketID       string  `json:"marketId"`
	MarketQuestion string  `json:"marketQuestion"`
	Side           string  `json:"side"`
	Type           string  `json:"type"`
	Price          float64 `json:"price"`
	Amount         float64 `json:"amount"`
	Shares         float64 `json:"shares"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"createdAt"`
}

type PositionEntry struct {
	ID             string  `json:"id"`
	MarketID       string  `json:"marketId"`
	MarketQuestion string  `json:"marketQuestion"`
	Side           string  `json:"side"`
	Shares         float64 `json:"shares"`
	AvgPrice       float64 `json:"avgPrice"`
	CurrentPrice   float64 `json:"currentPrice"`
	Pnl            float64 `json:"pnl"`
	PnlPercent     float64 `json:"pnlPercent"`
	Value          float64 `json:"value"`
}

type PnlPoint struct {
	Date       string  `json:"date"`
	Pnl        float64 `json:"pnl"`
	Cumulative float64 `json:"cumulative"`
}

type TradeRecord struct {
	ID             int64   `json:"id,omitempty"`
	Timestamp      string  `json:"timestamp"`
	MarketID       string  `json:"marketId"`
	Question       string  `json:"question"`
	Side           string  `json:"side"`
	Price          float64 `json:"price"`
	Amount         float64 `json:"amount"`
	Edge           float64 `json:"edge"`
	CompositeScore float64 `json:"compositeScore"`
	OrderID        *string `json:"orderId"`
	Success        bool    `json:"success"`
	Error          *string `json:"error"`
}

type PaperTrade struct {
	ID                 int64    `json:"id"`
	Timestamp          string   `json:"timestamp"`
	MarketID           string   `json:"marketId"`
	Question           string   `json:"question"`
	Category           string   `json:"category"`
	Side               string   `json:"side"`
	EntryPrice         float64  `json:"entryPrice"`
	EffectiveEntryPrice float64 `json:"effectiveEntryPrice"`
	Amount             float64  `json:"amount"`
	Shares             float64  `json:"shares"`
	Edge               float64  `json:"edge"`
	CompositeScore     float64  `json:"compositeScore"`
	SlippagePct        float64  `json:"slippagePct"`
	FeePct             float64  `json:"feePct"`
	Status             string   `json:"status"`
	ExitPrice          *float64 `json:"exitPrice"`
	EffectiveExitPrice *float64 `json:"effectiveExitPrice"`
	Pnl                *float64 `json:"pnl"`
	PnlPct             *float64 `json:"pnlPct"`
	ClosedAt           *string  `json:"closedAt"`
}

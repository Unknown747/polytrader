package main

import (
	"log"
	"os"

	"polymarket-trader/internal/db"
	"polymarket-trader/internal/routes"
	"polymarket-trader/internal/services"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Println("Starting Polymarket Trader API (Go edition)...")

	db.Init()
	services.SeedIfEmpty()
	services.StartScheduler()

	router := routes.SetupRouter()
	addr := "0.0.0.0:" + port
	log.Printf("Server listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

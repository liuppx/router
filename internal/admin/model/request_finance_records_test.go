package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestFinanceRecordsBackfillFromConsumeLogs(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-records?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}); err != nil {
		t.Fatalf("migrate logs: %v", err)
	}
	if err := db.Create(&Log{Id: "log-1", Type: LogTypeConsume, UserId: "user-1", ChannelId: "channel-1", BillingChargeAmount: 42, BillingProcurementCostStatus: ProcurementCostAttributionStatusPending}).Error; err != nil {
		t.Fatalf("create log: %v", err)
	}
	if err := migrateRequestFinanceRecordsWithDB(db); err != nil {
		t.Fatalf("backfill records: %v", err)
	}
	var settlement BillingSettlement
	if err := db.First(&settlement, "request_log_id = ?", "log-1").Error; err != nil {
		t.Fatalf("load settlement: %v", err)
	}
	if settlement.ChargeAmount != 42 || settlement.UserID != "user-1" {
		t.Fatalf("settlement = %+v", settlement)
	}
	var attribution ProcurementAttribution
	if err := db.First(&attribution, "request_log_id = ?", "log-1").Error; err != nil {
		t.Fatalf("load attribution: %v", err)
	}
	if attribution.ChannelID != "channel-1" || attribution.Status != ProcurementCostAttributionStatusPending {
		t.Fatalf("attribution = %+v", attribution)
	}
	if err := migrateRequestFinanceRecordsWithDB(db); err != nil {
		t.Fatalf("repeat backfill records: %v", err)
	}
}

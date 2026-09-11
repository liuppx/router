package model

import (
	"fmt"
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
	log2 := &Log{Id: "log-2", Type: LogTypeConsume, UserId: "user-2", BillingChargeAmount: 77, PromptTokens: 3, CompletionTokens: 4}
	if err := db.Create(log2).Error; err != nil {
		t.Fatalf("create second log: %v", err)
	}
	if err := RecordFinanceRecordsForLog(db, log2); err != nil {
		t.Fatalf("record normalized records: %v", err)
	}
	if err := CheckFinanceRecordConsistency(db, "log-2"); err != nil {
		t.Fatalf("consistency check: %v", err)
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

func TestFinanceRecordsBackfillProcessesBatches(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-records-batches?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	rows := make([]Log, 0, 1200)
	for i := 0; i < 1200; i++ {
		rows = append(rows, Log{Id: fmt.Sprintf("batch-log-%04d", i), Type: LogTypeConsume, BillingChargeAmount: int64(i + 1)})
	}
	if err := db.CreateInBatches(&rows, 100).Error; err != nil {
		t.Fatalf("create logs: %v", err)
	}
	if err := migrateRequestFinanceRecordsWithDB(db); err != nil {
		t.Fatalf("backfill records: %v", err)
	}
	var count int64
	if err := db.Model(&BillingSettlement{}).Count(&count).Error; err != nil {
		t.Fatalf("count settlements: %v", err)
	}
	if count != 1200 {
		t.Fatalf("settlement count = %d, want 1200", count)
	}
}

func TestLegacyProcurementRetryHelpersUseNormalizedRecords(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-retry-helpers?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	log := Log{Id: "retry-log", Type: LogTypeConsume, CreatedAt: 100, BillingProcurementCostStatus: ProcurementCostAttributionStatusNone}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("create log: %v", err)
	}
	if err := db.Create(&ProcurementAttribution{RequestLogID: log.Id, CreatedAt: log.CreatedAt, Status: ProcurementCostAttributionStatusRetry}).Error; err != nil {
		t.Fatalf("create attribution: %v", err)
	}

	rows, err := ListProcurementRetryLogs(db, 10, 200)
	if err != nil {
		t.Fatalf("list retry logs: %v", err)
	}
	if len(rows) != 1 || rows[0].Id != log.Id {
		t.Fatalf("retry logs = %+v", rows)
	}
	if _, err := GetProcurementRetryLog(db, log.Id); err != nil {
		t.Fatalf("get retry log: %v", err)
	}
	rows[0].BillingProcurementCostStatus = ProcurementCostAttributionStatusRetry
	if rows[0].BillingProcurementRetryCount != 0 {
		t.Fatalf("retry count = %d, want 0", rows[0].BillingProcurementRetryCount)
	}

	if err := MarkProcurementRetryFailureWithDB(db, log.Id, "upstream timeout", 123); err != nil {
		t.Fatalf("mark retry failure: %v", err)
	}
	var attribution ProcurementAttribution
	if err := db.First(&attribution, "request_log_id = ?", log.Id).Error; err != nil {
		t.Fatalf("load attribution: %v", err)
	}
	if attribution.RetryCount != 1 || attribution.LastRetryAt != 123 || attribution.LastError != "upstream timeout" {
		t.Fatalf("attribution = %+v", attribution)
	}
	if err := ClearProcurementRetryFailureWithDB(db, log.Id); err != nil {
		t.Fatalf("clear retry failure: %v", err)
	}
	if err := db.First(&attribution, "request_log_id = ?", log.Id).Error; err != nil {
		t.Fatalf("reload attribution: %v", err)
	}
	if attribution.LastError != "" {
		t.Fatalf("last error = %q", attribution.LastError)
	}
}

func TestCreateLogWithFinanceRecordsIsAtomic(t *testing.T) {
	t.Run("creates all records", func(t *testing.T) {
		db, err := gorm.Open(sqlite.Open("file:finance-create-success?mode=memory&cache=shared"), &gorm.Config{})
		if err != nil {
			t.Fatalf("open sqlite: %v", err)
		}
		if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
			t.Fatalf("migrate records: %v", err)
		}
		row := &Log{Id: "atomic-log", Type: LogTypeConsume, BillingChargeAmount: 42, BillingProcurementCostStatus: ProcurementCostAttributionStatusPending}
		if err := CreateLogWithFinanceRecords(db, row); err != nil {
			t.Fatalf("create records: %v", err)
		}
		for table, target := range map[string]any{
			EventLogsTableName:               &Log{},
			BillingSettlementsTableName:      &BillingSettlement{},
			ProcurementAttributionsTableName: &ProcurementAttribution{},
		} {
			var count int64
			if err := db.Model(target).Count(&count).Error; err != nil {
				t.Fatalf("count %s: %v", table, err)
			}
			if count != 1 {
				t.Fatalf("%s count = %d, want 1", table, count)
			}
		}
	})

	t.Run("rolls back without normalized tables", func(t *testing.T) {
		db, err := gorm.Open(sqlite.Open("file:finance-create-rollback?mode=memory&cache=shared"), &gorm.Config{})
		if err != nil {
			t.Fatalf("open sqlite: %v", err)
		}
		if err := db.AutoMigrate(&Log{}); err != nil {
			t.Fatalf("migrate logs: %v", err)
		}
		err = CreateLogWithFinanceRecords(db, &Log{Id: "rolled-back-log", Type: LogTypeConsume})
		if err == nil {
			t.Fatal("expected missing normalized table error")
		}
		var count int64
		if err := db.Model(&Log{}).Where("id = ?", "rolled-back-log").Count(&count).Error; err != nil {
			t.Fatalf("count logs: %v", err)
		}
		if count != 0 {
			t.Fatalf("log count = %d, want rollback", count)
		}
	})
}

package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestProcurementRetryHelpersUseNormalizedRecords(t *testing.T) {
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
		if db.Migrator().HasColumn(EventLogsTableName, "billing_charge_amount") || db.Migrator().HasColumn(EventLogsTableName, "billing_procurement_cost_status") {
			t.Fatal("event_logs must not own normalized finance columns")
		}
		row := &Log{
			Id:                               "atomic-log",
			Type:                             LogTypeConsume,
			BillingChargeAmount:              42,
			BillingProcurementCostBaseAmount: 12.5,
			BillingProcurementCostStatus:     ProcurementCostAttributionStatusPending,
		}
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
		var settlement BillingSettlement
		if err := db.First(&settlement, "request_log_id = ?", row.Id).Error; err != nil {
			t.Fatalf("load settlement: %v", err)
		}
		if settlement.ChargeAmount != 42 {
			t.Fatalf("settlement charge = %d, want 42", settlement.ChargeAmount)
		}
		var attribution ProcurementAttribution
		if err := db.First(&attribution, "request_log_id = ?", row.Id).Error; err != nil {
			t.Fatalf("load attribution: %v", err)
		}
		if attribution.CostBaseAmount != 12.5 || attribution.Status != ProcurementCostAttributionStatusPending {
			t.Fatalf("attribution = %+v", attribution)
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

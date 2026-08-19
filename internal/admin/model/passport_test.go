package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSyncPassportIdentityEmailWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&PassportIdentityBinding{}); err != nil {
		t.Fatalf("migrate binding: %v", err)
	}
	binding := PassportIdentityBinding{SubjectID: "subject-1", UserID: "user-1"}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}

	if err := SyncPassportIdentityEmailWithDB(db, binding.SubjectID, true, " Person@Example.COM ", "2026-08-09T00:00:00Z"); err != nil {
		t.Fatalf("sync verified email: %v", err)
	}
	stored := PassportIdentityBinding{}
	if err := db.First(&stored, "subject_id = ?", binding.SubjectID).Error; err != nil {
		t.Fatalf("load binding: %v", err)
	}
	if stored.Email != "person@example.com" || stored.EmailStatus != "verified" || stored.EmailVerifiedAt == "" || stored.EmailSyncedAt == 0 {
		t.Fatalf("unexpected verified email snapshot: %+v", stored)
	}

	if err := SyncPassportIdentityEmailWithDB(db, binding.SubjectID, false, "ignored@example.com", "ignored"); err != nil {
		t.Fatalf("clear unverified email: %v", err)
	}
	if err := db.First(&stored, "subject_id = ?", binding.SubjectID).Error; err != nil {
		t.Fatalf("reload binding: %v", err)
	}
	if stored.Email != "" || stored.EmailStatus != "unverified" || stored.EmailVerifiedAt != "" {
		t.Fatalf("unexpected unverified email snapshot: %+v", stored)
	}
}

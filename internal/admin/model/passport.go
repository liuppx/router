package model

import (
	"strings"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

const (
	PassportLoginSessionStatusPending  = "pending"
	PassportLoginSessionStatusApproved = "approved"
	PassportLoginSessionStatusComplete = "complete"
	PassportLoginSessionStatusFailed   = "failed"
)

// PassportIdentityBinding links a YeYing Passport subject to one local user.
// Wallet matching is used only once for backwards-compatible binding creation.
type PassportIdentityBinding struct {
	SubjectID       string `gorm:"type:varchar(128);primaryKey"`
	UserID          string `gorm:"type:char(36);not null;uniqueIndex"`
	WalletAddress   string `gorm:"type:varchar(128);not null;default:'';index"`
	Email           string `gorm:"type:varchar(320);not null;default:''"`
	EmailStatus     string `gorm:"type:varchar(32);not null;default:'';index"`
	EmailVerifiedAt string `gorm:"type:varchar(64);not null;default:''"`
	EmailSyncedAt   int64  `gorm:"bigint;not null;default:0;index"`
	CreatedAt       int64  `gorm:"bigint;index"`
	UpdatedAt       int64  `gorm:"bigint;index"`
}

func (PassportIdentityBinding) TableName() string { return "passport_identity_bindings" }

// PassportLoginSession contains server-side PKCE material for a short-lived
// login attempt. The verifier must never be sent to the browser.
type PassportLoginSession struct {
	SessionID    string `gorm:"type:char(64);primaryKey"`
	State        string `gorm:"type:char(64);not null;uniqueIndex"`
	RequestID    string `gorm:"type:varchar(128);not null;uniqueIndex"`
	CodeVerifier string `gorm:"type:varchar(128);not null"`
	Status       string `gorm:"type:varchar(32);not null;index"`
	Code         string `gorm:"type:varchar(256);not null;default:''"`
	UserID       string `gorm:"type:char(36);not null;default:'';index"`
	ErrorMessage string `gorm:"type:varchar(255);not null;default:''"`
	ExpiresAt    int64  `gorm:"bigint;not null;index"`
	CreatedAt    int64  `gorm:"bigint;index"`
	UpdatedAt    int64  `gorm:"bigint;index"`
}

type WalletIdentityBinding struct {
	WalletIdentityID string `gorm:"type:varchar(128);primaryKey"`
	DID              string `gorm:"type:varchar(160);not null;uniqueIndex"`
	UserID           string `gorm:"type:char(36);not null;uniqueIndex"`
	WalletAddress    string `gorm:"type:varchar(128);not null;default:'';index"`
	CreatedAt        int64  `gorm:"bigint;index"`
	UpdatedAt        int64  `gorm:"bigint;index"`
}

func (WalletIdentityBinding) TableName() string { return "wallet_identity_bindings" }

func FindWalletIdentityBinding(identityID string) (*WalletIdentityBinding, error) {
	row := &WalletIdentityBinding{}
	if err := DB.Where("wallet_identity_id = ?", strings.TrimSpace(identityID)).First(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func UpsertWalletIdentityBinding(binding *WalletIdentityBinding) error {
	return DB.Where("wallet_identity_id = ?", binding.WalletIdentityID).Assign(binding).FirstOrCreate(&WalletIdentityBinding{}).Error
}

func (PassportLoginSession) TableName() string { return "passport_login_sessions" }

func FindPassportLoginSessionByID(sessionID string) (*PassportLoginSession, error) {
	row := &PassportLoginSession{}
	if err := DB.Where("session_id = ?", strings.TrimSpace(sessionID)).First(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func FindPassportLoginSessionByState(state string) (*PassportLoginSession, error) {
	row := &PassportLoginSession{}
	if err := DB.Where("state = ?", strings.TrimSpace(state)).First(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func FindPassportIdentityBinding(subjectID string) (*PassportIdentityBinding, error) {
	row := &PassportIdentityBinding{}
	if err := DB.Where("subject_id = ?", strings.TrimSpace(subjectID)).First(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func UserHasConfiguredPassportEmail(userID string) bool {
	if DB == nil || strings.TrimSpace(userID) == "" {
		return false
	}
	var count int64
	return DB.Model(&PassportIdentityBinding{}).
		Where("user_id = ? AND email_status = ? AND TRIM(email) <> ''", strings.TrimSpace(userID), "verified").
		Count(&count).Error == nil && count > 0
}

func UpsertPassportIdentityBinding(binding *PassportIdentityBinding) error {
	return DB.Where("subject_id = ?", binding.SubjectID).Assign(binding).FirstOrCreate(&PassportIdentityBinding{}).Error
}

func SyncPassportIdentityEmailWithDB(db *gorm.DB, subjectID string, verified bool, email string, verifiedAt string) error {
	if db == nil {
		return gorm.ErrInvalidDB
	}
	subjectID = strings.TrimSpace(subjectID)
	if subjectID == "" {
		return gorm.ErrInvalidData
	}
	updates := map[string]any{
		"email":             "",
		"email_status":      "unverified",
		"email_verified_at": "",
		"email_synced_at":   helper.GetTimestamp(),
		"updated_at":        helper.GetTimestamp(),
	}
	if verified {
		normalizedEmail := strings.ToLower(strings.TrimSpace(email))
		if normalizedEmail != "" {
			updates["email"] = normalizedEmail
			updates["email_status"] = "verified"
			updates["email_verified_at"] = strings.TrimSpace(verifiedAt)
		}
	}
	result := db.Model(&PassportIdentityBinding{}).
		Where("subject_id = ?", subjectID).
		Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func SyncPassportIdentityEmail(subjectID string, verified bool, email string, verifiedAt string) error {
	return SyncPassportIdentityEmailWithDB(DB, subjectID, verified, email, verifiedAt)
}

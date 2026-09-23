package model

import "testing"

func TestApplyPersonalProviderLogBillingSourceDoesNotClaimCommunityCharge(t *testing.T) {
	entry := &Log{
		BillingSource:       LogBillingSourcePackage,
		BillingSourceID:     "package-1",
		BillingSourceName:   "monthly package",
		BillingSourceDetail: "old detail",
	}

	ApplyPersonalProviderLogBillingSource(entry)

	if entry.BillingSource != LogBillingSourcePersonalProvider {
		t.Fatalf("BillingSource = %q, want %q", entry.BillingSource, LogBillingSourcePersonalProvider)
	}
	if entry.BillingSourceName != "未扣社区套餐" {
		t.Fatalf("BillingSourceName = %q", entry.BillingSourceName)
	}
	if entry.BillingSourceID != "" || entry.BillingSourceDetail != "" {
		t.Fatalf("personal source retained community billing detail: %#v", entry)
	}
}

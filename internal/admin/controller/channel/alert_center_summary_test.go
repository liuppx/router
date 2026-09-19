package channel

import (
	"testing"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/internal/admin/model"
)

func TestBuildChannelAlertFeedSummary(t *testing.T) {
	now := helper.GetTimestamp()
	items := []channelAlertFeedItem{
		{
			ID:          "a",
			Type:        model.ChannelAlertTypeCircuitBreaker,
			Level:       "critical",
			Status:      model.ChannelAlertStatusActive,
			ChannelID:   "ch-1",
			ChannelName: "Alpha",
			CreatedAt:   now - 3600,
		},
		{
			ID:          "b",
			Type:        model.ChannelAlertTypeCircuitBreaker,
			Level:       "critical",
			Status:      model.ChannelAlertStatusResolved,
			ChannelID:   "ch-1",
			ChannelName: "Alpha",
			CreatedAt:   now - 2*3600,
		},
		{
			ID:          "c",
			Type:        model.ChannelAlertTypeBilling,
			Level:       "warning",
			Status:      model.ChannelAlertStatusAcknowledged,
			ChannelID:   "ch-2",
			ChannelName: "Beta",
			CreatedAt:   now - 5*24*3600,
		},
	}

	summary := buildChannelAlertFeedSummary(items, "all")

	if summary.Total != 3 {
		t.Fatalf("expected total 3, got %d", summary.Total)
	}
	// b is resolved, so active total is a + c = 2.
	if summary.ActiveTotal != 2 {
		t.Fatalf("expected active total 2, got %d", summary.ActiveTotal)
	}
	// a is critical + not resolved; b is critical but resolved -> only a counts.
	if summary.UnresolvedCritical != 1 {
		t.Fatalf("expected unresolved critical 1, got %d", summary.UnresolvedCritical)
	}
	// only a has status active.
	if summary.Unacknowledged != 1 {
		t.Fatalf("expected unacknowledged 1, got %d", summary.Unacknowledged)
	}
	// a and b are within 24h; c is 5 days ago.
	if summary.Last24h != 2 {
		t.Fatalf("expected last 24h 2, got %d", summary.Last24h)
	}

	// Type distribution: circuit=2 should rank above billing=1.
	if len(summary.TypeDistribution) != 2 {
		t.Fatalf("expected 2 type buckets, got %d", len(summary.TypeDistribution))
	}
	if summary.TypeDistribution[0].Key != model.ChannelAlertTypeCircuitBreaker ||
		summary.TypeDistribution[0].Count != 2 {
		t.Fatalf("expected circuit=2 first, got %+v", summary.TypeDistribution[0])
	}
	if summary.TypeDistribution[0].Label != "circuit" {
		t.Fatalf("expected circuit label, got %q", summary.TypeDistribution[0].Label)
	}

	// Channel distribution: ch-1=2 should rank above ch-2=1, labels use channel name.
	if len(summary.ChannelDistribution) != 2 {
		t.Fatalf("expected 2 channel buckets, got %d", len(summary.ChannelDistribution))
	}
	if summary.ChannelDistribution[0].Key != "ch-1" ||
		summary.ChannelDistribution[0].Count != 2 ||
		summary.ChannelDistribution[0].Label != "Alpha" {
		t.Fatalf("expected ch-1 Alpha=2 first, got %+v", summary.ChannelDistribution[0])
	}

	// Trend buckets are hourly and sorted ascending.
	if len(summary.Trend) == 0 {
		t.Fatalf("expected trend points, got none")
	}
	for i := 1; i < len(summary.Trend); i++ {
		if summary.Trend[i].Bucket < summary.Trend[i-1].Bucket {
			t.Fatalf("trend not sorted ascending at %d", i)
		}
	}
}

func TestSortedAlertTrendPointsTrimByWindow(t *testing.T) {
	now := helper.GetTimestamp()
	buckets := map[int64]int{
		(now / 3600) * 3600:               3, // recent
		((now - 5*24*3600) / 3600) * 3600: 1, // 5 days ago
	}

	// 24h window keeps only the recent bucket.
	points := sortedAlertTrendPoints(buckets, "24h", now)
	if len(points) != 1 {
		t.Fatalf("expected 1 point within 24h, got %d", len(points))
	}

	// "all" keeps every bucket.
	pointsAll := sortedAlertTrendPoints(buckets, "all", now)
	if len(pointsAll) != 2 {
		t.Fatalf("expected 2 points for all, got %d", len(pointsAll))
	}
}

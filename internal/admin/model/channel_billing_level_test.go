package model

import "testing"

func TestChannelBillingLevelFromSnapshot(t *testing.T) {
	cases := []struct {
		name  string
		items []ChannelBillingSnapshotItem
		want  string
	}{
		{
			name:  "no items",
			items: nil,
			want:  "",
		},
		{
			name: "all active",
			items: []ChannelBillingSnapshotItem{
				{Status: ChannelBillingItemStatusActive},
				{Status: ChannelBillingItemStatusActive},
			},
			want: "",
		},
		{
			name: "expired only is not low",
			items: []ChannelBillingSnapshotItem{
				{Status: ChannelBillingItemStatusExpired},
			},
			want: "",
		},
		{
			name: "any low wins over active",
			items: []ChannelBillingSnapshotItem{
				{Status: ChannelBillingItemStatusActive},
				{Status: ChannelBillingItemStatusLow},
			},
			want: ChannelBillingItemStatusLow,
		},
		{
			name: "depleted wins over low",
			items: []ChannelBillingSnapshotItem{
				{Status: ChannelBillingItemStatusLow},
				{Status: ChannelBillingItemStatusDepleted},
			},
			want: ChannelBillingItemStatusDepleted,
		},
		{
			name: "mixed-case status is normalized",
			items: []ChannelBillingSnapshotItem{
				{Status: "LOW"},
			},
			want: ChannelBillingItemStatusLow,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ChannelBillingLevelFromSnapshot(ChannelBillingSnapshot{Items: tc.items})
			if got != tc.want {
				t.Fatalf("ChannelBillingLevelFromSnapshot() = %q, want %q", got, tc.want)
			}
		})
	}
}

package utils

import "testing"

func TestResolveProvider(t *testing.T) {
	tests := []struct {
		name  string
		model string
		want  string
	}{
		{
			name:  "qwen3 prefix",
			model: "qwen3-vl-8b-instruct",
			want:  "qwen",
		},
		{
			name:  "llama prefix",
			model: "llama-3.1-8b-instruct",
			want:  "meta",
		},
		{
			name:  "flux prefix",
			model: "flux-1.1-pro",
			want:  "black-forest-labs",
		},
		{
			name:  "codestral prefix",
			model: "codestral-2501",
			want:  "mistral",
		},
		{
			name:  "mixtral prefix",
			model: "mixtral-8x22b-instruct",
			want:  "mistral",
		},
		{
			name:  "veo prefix",
			model: "veo-3.0-generate-preview",
			want:  "google",
		},
		{
			name:  "black forest labs prefixed model",
			model: "black-forest-labs/flux-1.1-pro",
			want:  "black-forest-labs",
		},
		{
			name:  "moonshot kimi prefix",
			model: "moonshotai/kimi-k2.5",
			want:  "moonshot",
		},
		{
			name:  "amazon nova prefixed model",
			model: "amazon/nova-2-lite-v1",
			want:  "amazon-nova",
		},
		{
			name:  "perplexity sonar prefix",
			model: "sonar-pro",
			want:  "perplexity",
		},
		{
			name:  "voyage prefix",
			model: "voyage-4",
			want:  "voyageai",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ResolveProvider(tt.model); got != tt.want {
				t.Fatalf("ResolveProvider(%q)=%q, want %q", tt.model, got, tt.want)
			}
		})
	}
}

func TestNormalizeProviderAliases(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{input: "x-ai", want: "xai"},
		{input: "x.ai", want: "xai"},
		{input: "meta", want: "meta"},
		{input: "Meta_Llama", want: "meta"},
		{input: "mistralai", want: "mistral"},
		{input: "MoonshotAI", want: "moonshot"},
		{input: "amazon_nova", want: "amazon-nova"},
		{input: "Voyage AI", want: "voyageai"},
		{input: "Assembly-AI", want: "assemblyai"},
	}
	for _, tt := range tests {
		if got := NormalizeProvider(tt.input); got != tt.want {
			t.Fatalf("NormalizeProvider(%q)=%q, want %q", tt.input, got, tt.want)
		}
	}
}

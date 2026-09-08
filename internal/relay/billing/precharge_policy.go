package billing

import (
	"fmt"
	"math"
	"strings"

	adminmodel "github.com/yeying-community/router/internal/admin/model"
)

type PrechargePolicyResolution struct {
	Policy  PrechargePolicy
	Source  string
	Version string
}

// ResolvePrechargePolicy converts the published model billing specification
// into the runtime policy. A missing or invalid model policy safely falls back
// to the legacy global reserve.
func ResolvePrechargePolicy(spec *adminmodel.ProviderModelSpecification, fallback int64) PrechargePolicyResolution {
	if spec != nil && spec.Billing != nil {
		configured := spec.Billing
		policy, err := NormalizePrechargePolicy(PrechargePolicy{
			Type: configured.PrechargePolicy, MinimumReserve: configured.MinimumReserve,
			InputSafetyFactor: configured.InputSafetyFactor, OutputReserveTokens: configured.OutputReserveTokens,
		}, fallback)
		if err == nil {
			version := configured.Version
			if version <= 0 {
				version = spec.Version
			}
			if version <= 0 {
				version = 1
			}
			return PrechargePolicyResolution{Policy: policy, Source: "model_specification", Version: fmt.Sprintf("billing-v%d", version)}
		}
	}
	// Preserve the legacy behavior (global reserve + prompt + requested output)
	// when no model policy is configured.
	policy, _ := NormalizePrechargePolicy(PrechargePolicy{Type: PrechargeTokenizerEstimate, MinimumReserve: fallback}, fallback)
	return PrechargePolicyResolution{Policy: policy, Source: "global_fallback", Version: "global-v1"}
}

// PrechargePolicy describes request-time quota reservation. It deliberately
// does not decide the final customer charge; provider usage remains authoritative.
type PrechargePolicy struct {
	Type                string  `json:"precharge_policy,omitempty"`
	MinimumReserve      int64   `json:"minimum_reserve,omitempty"`
	InputSafetyFactor   float64 `json:"input_safety_factor,omitempty"`
	OutputReserveTokens int     `json:"output_reserve_tokens,omitempty"`
}

const (
	PrechargeFixedReserve      = "fixed_reserve"
	PrechargeTokenizerEstimate = "tokenizer_estimate"
	PrechargeHeuristicEstimate = "heuristic_estimate"
	PrechargeMaxOutputReserve  = "max_output_reserve"
)

// NormalizePrechargePolicy applies conservative defaults and rejects unknown
// policies so a malformed model publication cannot silently under-reserve.
func NormalizePrechargePolicy(policy PrechargePolicy, fallback int64) (PrechargePolicy, error) {
	policy.Type = strings.ToLower(strings.TrimSpace(policy.Type))
	if policy.Type == "" {
		policy.Type = PrechargeTokenizerEstimate
	}
	switch policy.Type {
	case PrechargeFixedReserve, PrechargeTokenizerEstimate, PrechargeHeuristicEstimate, PrechargeMaxOutputReserve:
	default:
		return PrechargePolicy{}, fmt.Errorf("unsupported precharge policy %q", policy.Type)
	}
	if policy.MinimumReserve < 0 {
		policy.MinimumReserve = 0
	}
	if policy.InputSafetyFactor <= 0 || math.IsNaN(policy.InputSafetyFactor) || math.IsInf(policy.InputSafetyFactor, 0) {
		policy.InputSafetyFactor = 1
	}
	if policy.OutputReserveTokens < 0 {
		policy.OutputReserveTokens = 0
	}
	if policy.MinimumReserve == 0 && fallback > 0 {
		policy.MinimumReserve = fallback
	}
	return policy, nil
}

// ReserveTokens computes the conservative token budget before a request is sent.
func (p PrechargePolicy) ReserveTokens(promptTokens, maxOutputTokens int) int64 {
	if promptTokens < 0 {
		promptTokens = 0
	}
	if maxOutputTokens < 0 {
		maxOutputTokens = 0
	}
	input := int64(math.Ceil(float64(promptTokens) * p.InputSafetyFactor))
	output := int64(maxOutputTokens)
	switch p.Type {
	case PrechargeFixedReserve:
		return p.MinimumReserve
	case PrechargeMaxOutputReserve:
		return p.MinimumReserve + output
	case PrechargeHeuristicEstimate, PrechargeTokenizerEstimate:
		if p.OutputReserveTokens > 0 && output == 0 {
			output = int64(p.OutputReserveTokens)
		}
		return p.MinimumReserve + input + output
	default:
		return p.MinimumReserve + input + output
	}
}

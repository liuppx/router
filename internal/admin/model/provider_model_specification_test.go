package model

import "testing"

func TestProviderModelSpecificationSupportsFileInputRequiresTransportAndTypes(t *testing.T) {
	base := &ProviderModelSpecification{Endpoints: map[string]ProviderModelEndpointSpecification{
		"/v1/audio/transcriptions": {
			InputModalities: []string{"audio_file"},
			FileTypes:       []string{"mp3"},
			SupportsUpload:  true,
		},
	}}
	if !ProviderModelSpecificationSupportsFileInput(base) {
		t.Fatal("expected audio file specification to support file input")
	}
	base.Endpoints["/v1/audio/transcriptions"] = ProviderModelEndpointSpecification{InputModalities: []string{"audio_file"}, FileTypes: []string{"mp3"}}
	if ProviderModelSpecificationSupportsFileInput(base) {
		t.Fatal("file types without upload or URL transport must not qualify")
	}
}

func TestProviderModelSpecificationRoundTripsBillingPolicy(t *testing.T) {
	spec := &ProviderModelSpecification{Version: 1, Billing: &ProviderModelBillingSpecification{
		PrechargePolicy: "tokenizer_estimate", MinimumReserve: 500, InputSafetyFactor: 1.1, OutputReserveTokens: 4096,
	}}
	raw := MarshalProviderModelSpecification(spec)
	got, err := ParseProviderModelSpecification(raw)
	if err != nil || got == nil || got.Billing == nil {
		t.Fatalf("billing specification lost: got=%+v err=%v", got, err)
	}
	if got.Billing.PrechargePolicy != "tokenizer_estimate" || got.Billing.MinimumReserve != 500 || got.Billing.OutputReserveTokens != 4096 {
		t.Fatalf("billing specification = %+v", got.Billing)
	}
}

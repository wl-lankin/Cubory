// Package signing kapselt das Ed25519-Schlüsselpaar für Lizenz-Tokens.
// Der Private Key lebt nur auf dem Server; der Public Key wird in die
// Desktop-App einkompiliert.
package signing

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

type Signer struct {
	priv ed25519.PrivateKey
	pub  ed25519.PublicKey
}

// FromSeedB64 lädt den Key aus einem base64-kodierten 32-Byte-Seed (prod: env/KMS).
func FromSeedB64(seedB64 string) (*Signer, error) {
	seed, err := base64.StdEncoding.DecodeString(seedB64)
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("license signing key: erwarte base64-kodierten %d-Byte-Seed", ed25519.SeedSize)
	}
	priv := ed25519.NewKeyFromSeed(seed)
	return &Signer{priv: priv, pub: priv.Public().(ed25519.PublicKey)}, nil
}

// DevDeterministic leitet in der Entwicklung einen stabilen Key aus einem
// Secret ab, damit App und API ohne Schlüsselverteilung zusammenspielen.
// Niemals in prod verwenden.
func DevDeterministic(secret []byte) *Signer {
	seed := sha256.Sum256(append([]byte("cubory-license-dev:"), secret...))
	priv := ed25519.NewKeyFromSeed(seed[:])
	return &Signer{priv: priv, pub: priv.Public().(ed25519.PublicKey)}
}

// Sign signiert ein Payload und liefert "base64url(payload).base64url(sig)".
func (s *Signer) Sign(payload []byte) string {
	sig := ed25519.Sign(s.priv, payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

// Verify prüft ein Token und gibt das Payload zurück (für Tests/Tools;
// der Desktop-Client implementiert dieselbe Prüfung).
func Verify(pub ed25519.PublicKey, token string) ([]byte, bool) {
	var payloadB64, sigB64 string
	if n, err := fmt.Sscanf(token, "%s", &token); n != 1 || err != nil {
		return nil, false
	}
	i := -1
	for j := len(token) - 1; j >= 0; j-- {
		if token[j] == '.' {
			i = j
			break
		}
	}
	if i < 0 {
		return nil, false
	}
	payloadB64, sigB64 = token[:i], token[i+1:]
	payload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, false
	}
	sig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return nil, false
	}
	return payload, ed25519.Verify(pub, payload, sig)
}

func (s *Signer) PublicKeyB64() string {
	return base64.StdEncoding.EncodeToString(s.pub)
}

func (s *Signer) PublicKey() ed25519.PublicKey { return s.pub }

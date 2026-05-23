#!/usr/bin/env bash
# Generates a release keystore for DabaCash Android signing.
# Run ONCE locally, then store the base64-encoded keystore as a GitHub Secret.
#
# Usage:
#   chmod +x scripts/generate-keystore.sh
#   ./scripts/generate-keystore.sh
#
# After running, copy the base64 output into GitHub Secret: ANDROID_KEYSTORE_BASE64

set -euo pipefail

KEYSTORE_FILE="dabacash-release.keystore"
KEY_ALIAS="dabacash-key"
VALIDITY_DAYS=10000

echo "🔑 Generating DabaCash release keystore..."
echo "   You will be prompted for keystore password and certificate details."
echo ""

keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -storetype PKCS12

echo ""
echo "✅ Keystore generated: $KEYSTORE_FILE"
echo ""
echo "📋 Next steps:"
echo "   1. Base64-encode the keystore:"
echo "      base64 -w 0 $KEYSTORE_FILE | pbcopy   # macOS"
echo "      base64 -w 0 $KEYSTORE_FILE            # Linux (copy output)"
echo ""
echo "   2. Add these GitHub Secrets (Settings → Secrets → Actions):"
echo "      ANDROID_KEYSTORE_BASE64   ← base64 output above"
echo "      ANDROID_KEYSTORE_PASSWORD ← keystore password you just set"
echo "      ANDROID_KEY_ALIAS         ← $KEY_ALIAS"
echo "      ANDROID_KEY_PASSWORD      ← key password you just set"
echo ""
echo "   3. DO NOT commit $KEYSTORE_FILE to git!"
echo "      It should already be in .gitignore."

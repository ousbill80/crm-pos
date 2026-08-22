import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { resolveProduitImageUrl } from './produit-image';

/**
 * Vignette produit — photo API ou pastille SVG locale (toujours visible).
 */
export function ProduitThumb({
  imageUrl,
  label = '',
  size = 56,
  round = 0.18,
}: {
  imageUrl?: string | null;
  label?: string;
  size?: number;
  round?: number;
}) {
  const src = resolveProduitImageUrl(imageUrl, label);
  const [broken, setBroken] = useState(false);
  const radius = Math.round(size * round);
  const fallback = resolveProduitImageUrl(null, label);

  return (
    <Image
      source={{ uri: broken ? fallback : src }}
      style={[
        styles.img,
        { width: size, height: size, borderRadius: radius },
      ]}
      resizeMode="cover"
      onError={() => setBroken(true)}
    />
  );
}

const styles = StyleSheet.create({
  img: {
    backgroundColor: '#CCFBF1',
  },
});

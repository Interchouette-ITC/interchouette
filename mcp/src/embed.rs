//! Local bag-of-words embeddings for hybrid MCP search (no remote API).

/// Embedding dimensionality stored in `documents_vec`.
pub const EMBED_DIMS: usize = 256;

/// Model id written into `mcp_meta` at `make mcp-db` time.
pub const EMBED_MODEL: &str = "hash-bow-v1";

const RRF_K: f64 = 60.0;

/// Embed title + body into a unit L2 vector (`EMBED_DIMS` floats).
#[must_use]
pub fn embed_document(title: &str, body: &str) -> Vec<f32> {
    let mut text = String::with_capacity(title.len() + body.len() + 1);
    text.push_str(title);
    text.push('\n');
    text.push_str(body);
    embed_text(&text)
}

/// Embed arbitrary query text the same way as documents.
#[must_use]
pub fn embed_text(text: &str) -> Vec<f32> {
    let tokens = tokenize(text);
    let mut v = vec![0f32; EMBED_DIMS];
    if tokens.is_empty() {
        return v;
    }
    // Token counts stay tiny for catalog docs; clamp before f32.
    let n = tokens.len().clamp(1, 65_536);
    let weight = 1.0 / f32::from(u16::try_from(n).unwrap_or(u16::MAX)).sqrt();
    for token in &tokens {
        accumulate(&mut v, token, weight);
    }
    for window in tokens.windows(2) {
        let bigram = format!("{}_{}", window[0], window[1]);
        accumulate(&mut v, &bigram, weight * 0.5);
    }
    l2_normalize(&mut v);
    v
}

/// Cosine similarity for unit (or near-unit) vectors.
#[must_use]
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Pack f32 little-endian bytes for `SQLite` BLOB storage.
#[must_use]
pub fn packing(vec: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(vec.len() * 4);
    for f in vec {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}

/// Unpack a BLOB written by [`packing`].
///
/// # Errors
/// Returns when the byte length is not a multiple of 4 or dims mismatch.
pub fn unpacking(bytes: &[u8], dims: usize) -> anyhow::Result<Vec<f32>> {
    if bytes.len() != dims.saturating_mul(4) {
        anyhow::bail!(
            "embedding blob length {} does not match dims {dims}",
            bytes.len()
        );
    }
    let (chunks, _) = bytes.as_chunks::<4>();
    let mut out = Vec::with_capacity(dims);
    for chunk in chunks {
        out.push(f32::from_le_bytes(*chunk));
    }
    Ok(out)
}

/// Reciprocal rank fusion over two ranked slug lists.
#[must_use]
pub fn reciprocal_rank_fusion(a: &[String], b: &[String], limit: usize) -> Vec<String> {
    use std::collections::HashMap;
    let mut scores: HashMap<&str, f64> = HashMap::new();
    for (rank, slug) in a.iter().enumerate() {
        *scores.entry(slug.as_str()).or_default() += rrf_score(rank);
    }
    for (rank, slug) in b.iter().enumerate() {
        *scores.entry(slug.as_str()).or_default() += rrf_score(rank);
    }
    let mut ranked: Vec<(&str, f64)> = scores.into_iter().collect();
    ranked.sort_by(|x, y| {
        y.1.partial_cmp(&x.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| x.0.cmp(y.0))
    });
    ranked
        .into_iter()
        .take(limit)
        .map(|(slug, _)| slug.to_string())
        .collect()
}

fn rrf_score(rank: usize) -> f64 {
    let rank_f = u32::try_from(rank).map_or_else(|_| f64::from(u32::MAX), f64::from);
    1.0 / (RRF_K + rank_f + 1.0)
}

fn accumulate(v: &mut [f32], token: &str, weight: f32) {
    let h = fnv1a64(token.as_bytes());
    let dim = u64::try_from(EMBED_DIMS).unwrap_or(256);
    let idx = usize::try_from(h % dim).unwrap_or(0);
    let sign = if h & 1 == 0 { 1.0 } else { -1.0 };
    v[idx] = f32::mul_add(sign, weight, v[idx]);
}

fn l2_normalize(v: &mut [f32]) {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v {
            *x /= norm;
        }
    }
}

fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|t| !t.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0100_0000_01b3;
    let mut hash = OFFSET;
    for b in bytes {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn similar_texts_rank_higher_than_unrelated() {
        let owl = embed_text("ITCy is the Linux owl mascot and away-mode chat AI");
        let near = embed_text("company owl chatbot mascot");
        let far = embed_text("calendar booking privacy policy cookies");
        assert!(cosine(&owl, &near) > cosine(&owl, &far));
    }

    #[test]
    fn packing_roundtrip() {
        let v = embed_text("Gregory Roussac Rust MCP");
        let bytes = packing(&v);
        let back = unpacking(&bytes, EMBED_DIMS).unwrap();
        assert_eq!(v.len(), back.len());
        for (a, b) in v.iter().zip(back.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn rrf_prefers_shared_top_hits() {
        let a = vec!["itcy".into(), "overview".into()];
        let b = vec!["itcy".into(), "radio".into()];
        let merged = reciprocal_rank_fusion(&a, &b, 3);
        assert_eq!(merged[0], "itcy");
        assert!(merged.contains(&"overview".into()));
        assert!(merged.contains(&"radio".into()));
    }
}

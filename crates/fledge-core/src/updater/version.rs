//! Version compare / generation lock — mirrors packages/shared.

pub const APP_VERSION: &str = "0.5.1";

const GEN2_MIN_MINOR: u32 = 3;
const GEN3_MIN_MINOR: u32 = 5;

fn suffix_rank(suffix: &str) -> i32 {
    match suffix {
        "" => 8,
        "a" => 1,
        "b" => 2,
        "c" => 3,
        "ut" => 4,
        "up" => 5,
        "f" => 6,
        "rc" => 7,
        _ => 0,
    }
}

fn parse_segments(version: &str) -> Vec<(u32, String)> {
    let normalized = {
        let t = version.trim();
        if t.len() >= 4 && t[..4].eq_ignore_ascii_case("ver.") {
            &t[4..]
        } else if t.starts_with('v') || t.starts_with('V') {
            &t[1..]
        } else {
            t
        }
    };

    let mut segments: Vec<(u32, String)> = Vec::new();
    for part in normalized.split(['.', '-']) {
        let bytes = part.as_bytes();
        let mut i = 0;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        let num = if i > 0 {
            part[..i].parse::<u32>().unwrap_or(0)
        } else {
            0
        };
        let suffix = part[i..].to_ascii_lowercase();
        if i == 0 && !suffix.is_empty() {
            if let Some(prev) = segments.last_mut() {
                if prev.1.is_empty() {
                    prev.1 = suffix;
                    continue;
                }
            }
        }
        segments.push((num, suffix));
    }
    segments
}

/// Returns -1 if a < b, 0 if equal, 1 if a > b.
pub fn compare_versions(a: &str, b: &str) -> i32 {
    let pa = parse_segments(a);
    let pb = parse_segments(b);
    let len = pa.len().max(pb.len());
    for i in 0..len {
        let (da_num, da_suf) = pa.get(i).cloned().unwrap_or((0, String::new()));
        let (db_num, db_suf) = pb.get(i).cloned().unwrap_or((0, String::new()));
        if da_num < db_num {
            return -1;
        }
        if da_num > db_num {
            return 1;
        }
        if da_suf != db_suf {
            let ra = suffix_rank(&da_suf);
            let rb = suffix_rank(&db_suf);
            if ra != rb {
                return if ra < rb { -1 } else { 1 };
            }
            return if da_suf < db_suf { -1 } else { 1 };
        }
    }
    0
}

pub fn normalize_release_version(tag: &str) -> String {
    let t = tag.trim();
    if t.starts_with('v') || t.starts_with('V') {
        t[1..].to_string()
    } else {
        t.to_string()
    }
}

fn generation_minor(version: &str) -> u32 {
    let normalized = normalize_release_version(version);
    let rest = normalized.strip_prefix("0.").unwrap_or("");
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().unwrap_or(0)
}

pub fn is_generation1_app(version: &str) -> bool {
    generation_minor(version) < GEN2_MIN_MINOR
}

pub fn is_eligible_generation1_update(target: &str) -> bool {
    generation_minor(target) < GEN2_MIN_MINOR
}

pub fn is_generation2_app(version: &str) -> bool {
    let minor = generation_minor(version);
    minor >= GEN2_MIN_MINOR && minor < GEN3_MIN_MINOR
}

pub fn is_eligible_generation2_update(target: &str) -> bool {
    generation_minor(target) < GEN3_MIN_MINOR
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_basic() {
        assert_eq!(compare_versions("0.4.6", "0.5.0"), -1);
        assert_eq!(compare_versions("0.5.0", "0.5.0"), 0);
        assert_eq!(compare_versions("0.5.0a", "0.5.0"), -1);
    }

    #[test]
    fn gen_locks() {
        assert!(is_generation2_app("0.4.6"));
        assert!(!is_generation2_app("0.5.0"));
        assert!(!is_eligible_generation2_update("0.5.0"));
    }
}

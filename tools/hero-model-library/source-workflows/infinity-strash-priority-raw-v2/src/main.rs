use std::env;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};

fn safe_relative(raw: &str) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    if path.is_absolute() || path.components().any(|part| !matches!(part, Component::Normal(_))) {
        return Err(format!("unsafe manifest path: {raw}"));
    }
    Ok(path.to_path_buf())
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 4 {
        return Err(format!("usage: {} PAK MANIFEST OUTPUT", args[0]));
    }
    let pak_path = Path::new(&args[1]);
    let manifest_path = Path::new(&args[2]);
    let output = Path::new(&args[3]);
    fs::create_dir_all(output).map_err(|error| error.to_string())?;

    let mut source = BufReader::new(File::open(pak_path).map_err(|error| error.to_string())?);
    let pak = repak::PakBuilder::new()
        .reader(&mut source)
        .map_err(|error| error.to_string())?;
    let available = pak.files();
    let wanted = BufReader::new(File::open(manifest_path).map_err(|error| error.to_string())?);
    let mut extracted = 0usize;

    for line in wanted.lines() {
        let raw = line.map_err(|error| error.to_string())?;
        if raw.is_empty() {
            continue;
        }
        let relative = safe_relative(&raw)?;
        if available.binary_search(&raw).is_err() {
            return Err(format!("manifest entry is absent from pak index: {raw}"));
        }
        let target = output.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut destination = File::create(&target).map_err(|error| error.to_string())?;
        pak.read_file(&raw, &mut source, &mut destination)
            .map_err(|error| format!("extract {raw}: {error}"))?;
        extracted += 1;
        if extracted % 250 == 0 {
            println!("progress={extracted}");
        }
    }
    println!("extracted={extracted}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::safe_relative;

    #[test]
    fn accepts_normal_relative_paths() {
        assert!(safe_relative("strash/Content/A.uasset").is_ok());
    }

    #[test]
    fn rejects_parent_and_absolute_paths() {
        assert!(safe_relative("../escape").is_err());
        assert!(safe_relative("/absolute").is_err());
    }
}

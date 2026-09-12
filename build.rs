fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("installer/atelier.ico");
        res.set("FileDescription", "Atelier - Creative Social Media & Content Planning Studio");
        res.set("ProductName", "Atelier");
        res.set("OriginalFilename", "atelier.exe");
        res.set("LegalCopyright", "Copyright (C) 2026 Atelier Studio");
        if let Err(e) = res.compile() {
            eprintln!("cargo:warning=Failed to compile Windows resources: {}", e);
        }
    }
}

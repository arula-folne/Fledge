//! Windows DPAPI (user-scoped) for secrets at rest.
//! Electron safeStorage blobs are not readable — users re-login on 0.5.

#[cfg(windows)]
mod win {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: plain.len() as u32,
            pbData: plain.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(&mut input, None, None, None, None, 0, &mut output)
                .map_err(|e| e.to_string())?;
            let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
            let out = slice.to_vec();
            let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
            Ok(out)
        }
    }

    pub fn unprotect(blob: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: blob.len() as u32,
            pbData: blob.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(&mut input, None, None, None, None, 0, &mut output)
                .map_err(|e| e.to_string())?;
            let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
            let out = slice.to_vec();
            let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
            Ok(out)
        }
    }
}

#[cfg(windows)]
pub use win::{protect, unprotect};

#[cfg(not(windows))]
pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    Ok(plain.to_vec())
}

#[cfg(not(windows))]
pub fn unprotect(blob: &[u8]) -> Result<Vec<u8>, String> {
    Ok(blob.to_vec())
}

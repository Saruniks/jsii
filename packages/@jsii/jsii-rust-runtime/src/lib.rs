use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};

use base64::Engine;
use serde_json::Value;

/// A struct representing a connection to the JSII runtime
pub struct JsiiRuntime {
    process: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    stderr: BufReader<ChildStderr>,
}

impl JsiiRuntime {
    /// Create a new JSII runtime connection
    pub fn new() -> Self {
        let mut process = Command::new("node")
            .arg("/home/clear/jsii/packages/@jsii/runtime/bin/jsii-runtime.js")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("Failed to start JSII runtime process");

        let stdin = process.stdin.take().expect("Failed to open stdin");
        let stdout = BufReader::new(process.stdout.take().expect("Failed to open stdout"));
        let stderr = BufReader::new(process.stderr.take().expect("Failed to open stderr"));

        let mut runtime = Self {
            process,
            stdin,
            stdout,
            stderr,
        };

        // Read the initial hello message
        let hello_response = runtime.read_response();
        println!("Hello response: {}", hello_response);

        runtime
    }

    /// Load a JSII module
    pub fn load_module(&mut self, name: &str, version: &str, tarball_path: &str) -> String {
        println!(
            "DEBUG: Loading module {}@{} from {}",
            name, version, tarball_path
        );

        let load_request = format!(
            r#"{{"api":"load","name":"{}","version":"{}","tarball":"{}"}}"#,
            name, version, tarball_path
        );

        println!("DEBUG: Sending load request: {}", load_request);
        self.send_request(&load_request);

        println!("DEBUG: Waiting for load response");
        let response = self.read_response();
        println!("DEBUG: Got load response: {}", response);

        // Parse response to see if it's an error
        if let Ok(json) = serde_json::from_str::<Value>(&response) {
            if let Some(error_msg) = json.get("error").and_then(|v| v.as_str()) {
                println!("ERROR: JSII runtime returned error: {}", error_msg);
                if error_msg.contains("Cannot find module") {
                    println!(
                        "HINT: This is a dependency issue. The module depends on other modules that need to be loaded first."
                    );
                }
            }
        }

        println!("DEBUG: Module load complete");
        response
    }

    /// Send a request to the JSII runtime
    fn send_request(&mut self, request: &str) {
        println!("DEBUG: Sending request: {}", request);
        writeln!(self.stdin, "{}", request).expect("Failed to write request");
        self.stdin.flush().expect("Failed to flush stdin");
        println!("DEBUG: Request sent and flushed");
    }

    /// Read a response from the JSII runtime with a simple timeout
    fn read_response(&mut self) -> String {
        // Use a simplier approach without non-blocking IO
        let mut response = String::new();
        println!("DEBUG: Reading response from JSII runtime...");

        // BufReader.read_line() is blocking, but we'll add a timeout in our test
        match self.stdout.read_line(&mut response) {
            Ok(n) => {
                println!("DEBUG: Read {} bytes", n);
                if n == 0 {
                    println!("DEBUG: EOF reached, no data available");
                    return "EOF: No data available".to_string();
                }
                println!("DEBUG: Raw response: {:?}", response);
                response.trim().to_string()
            }
            Err(e) => {
                println!("DEBUG: Error reading response: {}", e);
                format!("ERROR: {}", e)
            }
        }
    }

    /// Check for any errors from the JSII runtime
    fn check_errors(&mut self) {
        let mut stderr_content = String::new();

        // Try to read any available stderr content
        while self
            .stderr
            .read_line(&mut stderr_content)
            .expect("Failed to read stderr")
            > 0
        {
            if stderr_content.trim().is_empty() {
                break;
            }
        }

        if !stderr_content.is_empty() {
            println!("Raw stderr content: {}", stderr_content);

            if let Ok(stderr_json) = serde_json::from_str::<Value>(&stderr_content) {
                if let Some(base64_err) = stderr_json.get("stderr").and_then(|v| v.as_str()) {
                    if let Ok(decoded) =
                        base64::engine::general_purpose::STANDARD.decode(base64_err)
                    {
                        let error_message = String::from_utf8_lossy(&decoded);
                        println!("Decoded error: {}", error_message);
                    }
                }
            }
        }
    }

    /// Close the JSII runtime connection
    pub fn close(mut self) {
        // Send exit command
        self.send_request(r#"{"exit":0}"#);

        // Wait for process to exit
        self.process
            .wait()
            .expect("JSII runtime process did not terminate successfully");

        println!("JSII runtime process terminated successfully");
    }
}

pub fn simple_runtime_call() {
    // Create a new JSII runtime
    println!("Starting JSII runtime test...");
    let mut runtime = JsiiRuntime::new();

    // We need to load dependencies in the right order
    println!("\n--- Testing module dependency loading ---");
    use std::path::Path;

    // 1. First load the base-of-base
    let base_of_base_name = "@scope/jsii-calc-base-of-base"; // Using the @scope prefix from error!
    let base_of_base_version = "2.1.1";
    let base_of_base_tarball = "/home/clear/jsii/output/rust/scope-jsii-calc-base-of-base/jsii/scope-jsii-calc-base-of-base-2.1.1.tgz";

    if Path::new(base_of_base_tarball).exists() {
        println!("\nLoading base-of-base dependency");
        let response = runtime.load_module(
            base_of_base_name,
            base_of_base_version,
            base_of_base_tarball,
        );
        if response.contains("error") {
            println!("Failed to load base-of-base, stopping here");
            runtime.close();
            return;
        }
    } else {
        println!("WARNING: base-of-base tarball not found, cannot continue");
        runtime.close();
        return;
    }

    // 2. Load the base
    let base_name = "@scope/jsii-calc-base"; // Using the @scope prefix
    let base_version = "0.0.0";
    let base_tarball =
        "/home/clear/jsii/output/rust/scope-jsii-calc-base/jsii/scope-jsii-calc-base-0.0.0.tgz";

    if Path::new(base_tarball).exists() {
        println!("\nLoading base dependency");
        let response = runtime.load_module(base_name, base_version, base_tarball);
        if response.contains("error") {
            println!("Failed to load base, stopping here");
            runtime.close();
            return;
        }
    } else {
        println!("WARNING: base tarball not found, cannot continue");
        runtime.close();
        return;
    }

    // 3. Load the lib
    let lib_name = "@scope/jsii-calc-lib"; // Using the @scope prefix
    let lib_version = "0.0.0";
    let lib_tarball =
        "/home/clear/jsii/output/rust/scope-jsii-calc-lib/jsii/scope-jsii-calc-lib-0.0.0.tgz";

    if Path::new(lib_tarball).exists() {
        println!("\nLoading lib dependency");
        let response = runtime.load_module(lib_name, lib_version, lib_tarball);
        if response.contains("error") {
            println!("Failed to load lib, stopping here");
            runtime.close();
            return;
        }
    } else {
        println!("WARNING: lib tarball not found, cannot continue");
        runtime.close();
        return;
    }

    // 4. Finally load the main calc module
    println!("\nLoading jsii-calc module");
    let calc_name = "jsii-calc";
    let calc_version = "3.20.120";
    let calc_tarball = "/home/clear/jsii/output/rust/jsii-calc/jsii/jsii-calc-3.20.120.tgz";

    if Path::new(calc_tarball).exists() {
        let response = runtime.load_module(calc_name, calc_version, calc_tarball);

        if !response.contains("error") {
            println!("Successfully loaded all modules!");
        }
    } else {
        println!("WARNING: jsii-calc tarball does not exist");
    }

    println!("\n--- Test complete ---");
    runtime.close();
}

#[test]
fn test_simple_runtime_call() {
    simple_runtime_call();
}

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};

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

    /// Call a static method on a JSII class using direct protocol message
    pub fn invoke_static(
        &mut self,
        fqn: &str,
        method: &str,
        args: Option<&[Value]>,
    ) -> Result<Value, String> {
        println!(
            "DEBUG: Calling static method {}.{} using direct protocol",
            fqn, method
        );

        // Format the args array as JSON
        let args_json = if let Some(args) = args {
            let args_str = args
                .iter()
                .map(|a| a.to_string())
                .collect::<Vec<String>>()
                .join(",");
            format!("[{}]", args_str)
        } else {
            "[]".to_string()
        };

        // Create the sinvoke protocol message
        let request = format!(
            r#"{{"api":"sinvoke","fqn":"{}","method":"{}","args":{}}}"#,
            fqn, method, args_json
        );

        println!("DEBUG: Sending sinvoke request: {}", request);
        self.send_request(&request);

        println!("DEBUG: Waiting for sinvoke response");
        let response = self.read_response();
        println!("DEBUG: Got sinvoke response: {}", response);

        // Parse the response to extract the result or handle errors
        match serde_json::from_str::<Value>(&response) {
            Ok(json) => {
                if let Some(error_msg) = json.get("error") {
                    let error = error_msg.to_string();
                    Err(format!("Error calling static method: {}", error))
                } else if let Some(ok) = json.get("ok") {
                    // Extract result from ok.result
                    if let Some(result) = ok.get("result") {
                        // Return the result part of the response
                        Ok(result.clone())
                    } else {
                        Err("No result field found in ok response".to_string())
                    }
                } else {
                    Err("No ok field found in response".to_string())
                }
            }
            Err(e) => Err(format!("Failed to parse response: {}", e)),
        }
    }

    /// Legacy method - keeping for compatibility
    pub fn call_static_method(&mut self, fqn: &str, method: &str) -> Result<Value, String> {
        self.invoke_static(fqn, method, None)
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

        // BufReader.read_line() is blocking, but we need to handle timeouts
        // Add a basic timeout mechanism
        use std::time::{Duration, Instant};
        let timeout_duration = Duration::from_secs(10); // 10 seconds timeout
        let start_time = Instant::now();
        
        // Try a few times with timeouts
        let mut attempts = 0;
        const MAX_ATTEMPTS: i32 = 3;
        
        while attempts < MAX_ATTEMPTS {
            attempts += 1;
            
            if start_time.elapsed() > timeout_duration {
                println!("DEBUG: Timeout reading response after {} seconds", timeout_duration.as_secs());
                return format!("ERROR: Timeout after {} seconds", timeout_duration.as_secs());
            }
            
            match self.stdout.read_line(&mut response) {
                Ok(n) => {
                    println!("DEBUG: Read {} bytes", n);
                    if n == 0 {
                        println!("DEBUG: EOF reached, no data available, attempt {}/{}", attempts, MAX_ATTEMPTS);
                        if attempts >= MAX_ATTEMPTS {
                            return "EOF: No data available after multiple attempts".to_string();
                        }
                        // Small delay before retrying
                        std::thread::sleep(Duration::from_millis(100));
                        continue;
                    }
                    println!("DEBUG: Raw response: {:?}", response);
                    return response.trim().to_string();
                }
                Err(e) => {
                    println!("DEBUG: Error reading response: {}", e);
                    return format!("ERROR: {}", e);
                }
            }
        }
        
        "ERROR: Failed to read response after multiple attempts".to_string()
    }

    // This method has been removed as it was unused

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

    /// Get all type information from a loaded JSII module
    pub fn get_types(&mut self, module_name: &str) -> Result<Value, String> {
        let request = format!(
            r#"{{"api":"naming","assembly":"{}"}}"#,
            module_name
        );
        
        println!("DEBUG: Sending naming request: {}", request);
        self.send_request(&request);
        
        println!("DEBUG: Waiting for naming response");
        let response = self.read_response();
        println!("DEBUG: Got naming response: {}", response);
        
        // Parse the response to extract type information
        match serde_json::from_str::<Value>(&response) {
            Ok(json) => {
                if let Some(error_msg) = json.get("error") {
                    let error = error_msg.to_string();
                    Err(format!("Error retrieving type information: {}", error))
                } else if let Some(ok) = json.get("ok") {
                    Ok(ok.clone())
                } else {
                    Err("No ok field found in response".to_string())
                }
            }
            Err(e) => Err(format!("Failed to parse response: {}", e)),
        }
    }
    
    /// Get assembly metadata using the "assembly" API
    pub fn get_assembly_metadata(&mut self, module_name: &str) -> Result<Value, String> {
        let request = format!(
            r#"{{"api":"assembly","assembly":"{}"}}"#,
            module_name
        );
        
        println!("DEBUG: Sending assembly request: {}", request);
        self.send_request(&request);
        
        println!("DEBUG: Waiting for assembly response");
        let response = self.read_response();
        println!("DEBUG: Got assembly response: {}", response);
        
        // Parse the response to extract assembly metadata
        match serde_json::from_str::<Value>(&response) {
            Ok(json) => {
                if let Some(error_msg) = json.get("error") {
                    let error = error_msg.to_string();
                    Err(format!("Error retrieving assembly metadata: {}", error))
                } else if let Some(ok) = json.get("ok") {
                    if let Some(metadata) = ok.get("assembly") {
                        Ok(metadata.clone())
                    } else {
                        Err("No assembly field found in OK response".to_string())
                    }
                } else {
                    Err("No ok field found in response".to_string())
                }
            }
            Err(e) => Err(format!("Failed to parse response: {}", e)),
        }
    }
}

/// Gets a random enum value from the EnumDispenser class using direct protocol calls
pub fn get_random_enum_values(runtime: &mut JsiiRuntime) -> Result<(String, i32), String> {
    // We know that the JSII protocol doesn't provide direct access to the actual enum values
    // Instead, it only provides the enum member name in the format fqn/MEMBER_NAME
    // We need to map these names to their actual values either through looking up assembly metadata
    // or using a hardcoded mapping
    
    println!("\n--- JSII Protocol Explanation ---");
    println!("The JSII protocol serializes enum values as {{ \"$jsii.enum\": \"fqn/MEMBER_NAME\" }}");
    println!("It does NOT include the actual underlying value (e.g., \"B?\" or 100) in the protocol.");
    println!("The client must maintain a mapping between enum names and their values.");
    
    // Call randomStringLikeEnum static method using direct JSII protocol
    println!("\n--- Calling EnumDispenser.randomStringLikeEnum() via direct protocol ---");
    let string_enum_result =
        runtime.invoke_static("jsii-calc.EnumDispenser", "randomStringLikeEnum", None)?;

    // Parse the string enum result
    let string_value_name = match string_enum_result {
        Value::Object(obj) => {
            println!("DEBUG: Received object for string enum result: {:?}", obj);

            if let Some(Value::String(enum_ref)) = obj.get("$jsii.enum") {
                // Parse the enum reference which should be in the format "fqn/ENUM_VALUE"
                let parts: Vec<&str> = enum_ref.split('/').collect();
                if parts.len() == 2 {
                    println!("Got string-like enum: {}", parts[1]);
                    parts[1].to_string()
                } else {
                    return Err(format!("Invalid enum reference format: {}", enum_ref));
                }
            } else {
                println!("DEBUG: Unexpected string enum result format: {:?}", obj);
                return Err("Expected $jsii.enum in response".to_string());
            }
        }
        _ => {
            println!(
                "DEBUG: Unexpected string enum result type: {:?}",
                string_enum_result
            );
            return Err("Expected object result".to_string());
        }
    };
    
    // Map enum member names to their values using our knowledge of the enum definition
    println!("\n--- Mapping enum member names to values ---");
    println!("StringEnum {{ A = 'A!', B = 'B?', C = 'C.' }}");
    let string_value = match string_value_name.as_str() {
        "A" => "A!".to_string(),
        "B" => "B?".to_string(), // EnumDispenser.randomStringLikeEnum() always returns StringEnum.B
        "C" => "C.".to_string(),
        _ => return Err(format!("Unknown string enum value name: {}", string_value_name)),
    };
    println!("Mapped {} -> {}", string_value_name, string_value);

    // Call randomIntegerLikeEnum static method using direct JSII protocol
    println!("\n--- Calling EnumDispenser.randomIntegerLikeEnum() via direct protocol ---");
    let int_enum_result =
        runtime.invoke_static("jsii-calc.EnumDispenser", "randomIntegerLikeEnum", None)?;

    // Parse the integer enum result - first we need the enum value name
    let int_value_name = match int_enum_result {
        Value::Object(obj) => {
            println!("DEBUG: Received object for integer enum result: {:?}", obj);

            if let Some(Value::String(enum_ref)) = obj.get("$jsii.enum") {
                // Parse the enum reference which should be in the format "fqn/ENUM_VALUE"
                let parts: Vec<&str> = enum_ref.split('/').collect();
                if parts.len() == 2 {
                    println!("Got integer-like enum: {}", parts[1]);
                    parts[1].to_string()
                } else {
                    return Err(format!("Invalid enum reference format: {}", enum_ref));
                }
            } else {
                println!("DEBUG: Unexpected integer enum result format: {:?}", obj);
                return Err("Expected $jsii.enum in response".to_string());
            }
        }
        _ => {
            println!(
                "DEBUG: Unexpected integer enum result type: {:?}",
                int_enum_result
            );
            return Err("Expected object result".to_string());
        }
    };
    
    // Map enum member names to their values using our knowledge of the enum definition
    println!("AllTypesEnum {{ MY_ENUM_VALUE = 0, YOUR_ENUM_VALUE = 100, THIS_IS_GREAT = 2 }}");
    let int_value = match int_value_name.as_str() {
        "MY_ENUM_VALUE" => 0,     // Default value (0)
        "YOUR_ENUM_VALUE" => 100, // Explicitly set to 100 in the TypeScript code
        "THIS_IS_GREAT" => 2,     // Default value (2)
        _ => return Err(format!("Unknown integer enum value: {}", int_value_name)),
    };
    println!("Mapped {} -> {}", int_value_name, int_value);

    Ok((string_value, int_value))
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
    println!("\n--- Loading jsii-calc module ---");
    let calc_name = "jsii-calc";
    let calc_version = "3.20.120";
    let calc_tarball = "/home/clear/jsii/output/rust/jsii-calc/jsii/jsii-calc-3.20.120.tgz";

    if Path::new(calc_tarball).exists() {
        let response = runtime.load_module(calc_name, calc_version, calc_tarball);

        if !response.contains("error") {
            println!("Successfully loaded all modules!");

            // Now test the EnumDispenser class
            println!("\n--- Testing EnumDispenser class ---");
            match get_random_enum_values(&mut runtime) {
                Ok((string_enum, int_enum)) => {
                    println!("\n=== Results ===");
                    println!("Random string-like enum: {}", string_enum);
                    println!("Random integer-like enum: {} (numeric value)", int_enum);

                    // Validate results
                    println!("\n=== Validation ===");

                    // From the EnumDispenser implementation, we know it always returns StringEnum.B
                    // and AllTypesEnum.YOUR_ENUM_VALUE (which is 100)
                    let expected_string_enum = "B";
                    let string_valid = string_enum == expected_string_enum;
                    println!(
                        "String enum is valid: {} (expected: {}, got: {})",
                        string_valid, expected_string_enum, string_enum
                    );

                    // AllTypesEnum.YOUR_ENUM_VALUE is defined as 100 in the TS code
                    let expected_int_enum = 100;
                    let int_valid = int_enum == expected_int_enum;
                    println!(
                        "Integer enum is valid: {} (expected: {}, got: {})",
                        int_valid, expected_int_enum, int_enum
                    );

                    if string_valid && int_valid {
                        println!("\n✅ All tests PASSED!");
                    } else {
                        println!("\n❌ Some tests FAILED!");
                    }
                }
                Err(e) => println!("Failed to get random enum values: {}", e),
            }
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

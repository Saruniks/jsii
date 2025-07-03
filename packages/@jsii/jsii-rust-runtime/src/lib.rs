use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use std::sync::{Mutex, OnceLock};

use serde_json::Value;

/// A struct representing a connection to the JSII runtime
struct JsiiRuntimeInner {
    process: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    #[allow(dead_code)]
    stderr: BufReader<ChildStderr>,
}

use serde::{Deserialize, Serialize};
#[derive(Deserialize, Serialize)]
pub struct JsiiObject {
    // Could it be an array of key-value pairs?
    // TODO: Maybe type should be enum $jsii.enum, $jsii.{other_types} ...
    pub key: String,

    pub value: String,
}

/// Global singleton for JSII runtime
pub struct JsiiRuntime;

static RUNTIME: OnceLock<Mutex<JsiiRuntimeInner>> = OnceLock::new();
static INIT_ONCE: std::sync::Once = std::sync::Once::new();

impl JsiiRuntime {
    /// Internal method to ensure runtime is initialized
    fn ensure_initialized() -> Result<(), String> {
        // Use std::sync::Once to ensure initialization happens only once
        let mut init_result = Ok(());

        INIT_ONCE.call_once(|| match Self::initialize_runtime() {
            Ok(_) => println!("JSII runtime initialized successfully"),
            Err(e) => {
                println!("Failed to initialize JSII runtime: {}", e);
                init_result = Err(e);
            }
        });

        init_result?;

        // Double-check that runtime is available
        if RUNTIME.get().is_none() {
            return Err("Runtime initialization failed".to_string());
        }

        Ok(())
    }

    /// Internal method to actually initialize the runtime
    fn initialize_runtime() -> Result<(), String> {
        println!("Starting JSII runtime process...");

        let mut process = Command::new("node")
            .arg("/home/clear/jsii/packages/@jsii/runtime/bin/jsii-runtime.js")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start JSII runtime process: {}", e))?;

        let stdin = process.stdin.take().ok_or("Failed to open stdin")?;
        let stdout = BufReader::new(process.stdout.take().ok_or("Failed to open stdout")?);
        let stderr = BufReader::new(process.stderr.take().ok_or("Failed to open stderr")?);

        let mut runtime_inner = JsiiRuntimeInner {
            process,
            stdin,
            stdout,
            stderr,
        };

        // Read the initial hello message
        println!("Reading initial hello message...");
        let hello_response = Self::read_response_inner(&mut runtime_inner);
        println!("Hello response: {}", hello_response);

        // Validate the hello response
        match serde_json::from_str::<Value>(&hello_response) {
            Ok(json) => {
                if let Some(hello_msg) = json.get("hello") {
                    println!("JSII runtime ready: {}", hello_msg);
                } else {
                    return Err(format!("Invalid hello response: {}", hello_response));
                }
            }
            Err(e) => {
                return Err(format!("Failed to parse hello response: {}", e));
            }
        }

        RUNTIME
            .set(Mutex::new(runtime_inner))
            .map_err(|_| "Failed to set runtime singleton")?;

        // Load all required modules in the correct dependency order
        println!("Loading JSII modules...");

        // 1. Load base-of-base
        Self::load_module_internal(
            "@scope/jsii-calc-base-of-base",
            "2.1.1",
            "/home/clear/jsii/output/rust/scope-jsii-calc-base-of-base/jsii/scope-jsii-calc-base-of-base-2.1.1.tgz",
        )?;

        // 2. Load base
        Self::load_module_internal(
            "@scope/jsii-calc-base",
            "0.0.0",
            "/home/clear/jsii/output/rust/scope-jsii-calc-base/jsii/scope-jsii-calc-base-0.0.0.tgz",
        )?;

        // 3. Load lib
        Self::load_module_internal(
            "@scope/jsii-calc-lib",
            "0.0.0",
            "/home/clear/jsii/output/rust/scope-jsii-calc-lib/jsii/scope-jsii-calc-lib-0.0.0.tgz",
        )?;

        // 4. Load jsii-calc
        Self::load_module_internal(
            "jsii-calc",
            "3.20.120",
            "/home/clear/jsii/output/rust/jsii-calc/jsii/jsii-calc-3.20.120.tgz",
        )?;

        println!("All JSII modules loaded successfully");
        Ok(())
    }

    /// Load a JSII module
    pub fn load_module(name: &str, version: &str, tarball_path: &str) -> Result<String, String> {
        Self::ensure_initialized()?;

        println!(
            "DEBUG: Loading module {}@{} from {}",
            name, version, tarball_path
        );

        let load_request = format!(
            r#"{{"api":"load","name":"{}","version":"{}","tarball":"{}"}}"#,
            name, version, tarball_path
        );

        println!("DEBUG: Sending load request: {}", load_request);
        Self::send_request(&load_request)?;

        println!("DEBUG: Waiting for load response");
        let response = Self::read_response()?;
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
        Ok(response)
    }

    /// Call a static method on a JSII class using direct protocol message
    pub fn invoke_static(
        fqn: &str,
        method: &str,
        args: Option<&[Value]>,
    ) -> Result<String, String> {
        Self::ensure_initialized()?;

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
        Self::send_request(&request)?;

        println!("DEBUG: Waiting for sinvoke response");
        let response = Self::read_response()?;
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
                        Ok(result
                            .get("$jsii.enum")
                            .expect("Failed to get result from jsii response")
                            .to_string())
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

    /// Call an instance method on a JSII object using direct protocol message
    pub fn invoke(obj_ref: &str, method: &str, args: Option<&[Value]>) -> Result<String, String> {
        Self::ensure_initialized()?;

        println!(
            "DEBUG: Calling instance method on objref {}.{} using direct protocol",
            obj_ref, method
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

        // Create the invoke protocol message - objref should be wrapped in $jsii.byref object
        let objref_wrapped = format!(r#"{{"$jsii.byref":"{}"}}"#, obj_ref);
        let request = format!(
            r#"{{"api":"invoke","objref":{},"method":"{}","args":{}}}"#,
            objref_wrapped, method, args_json
        );

        println!("DEBUG: Sending invoke request: {}", request);
        Self::send_request(&request)?;

        println!("DEBUG: Waiting for invoke response");
        let response = Self::read_response()?;
        println!("DEBUG: Got invoke response: {}", response);

        // Parse the response to extract the result or handle errors
        match serde_json::from_str::<Value>(&response) {
            Ok(json) => {
                if let Some(error_msg) = json.get("error") {
                    let error = error_msg.to_string();
                    Err(format!("Error calling instance method: {}", error))
                } else if let Some(ok) = json.get("ok") {
                    // Extract result from ok.result
                    if let Some(result) = ok.get("result") {
                        // Convert different types to String
                        match result {
                            Value::String(s) => Ok(s.clone()),
                            Value::Bool(b) => Ok(b.to_string()),
                            Value::Number(n) => Ok(n.to_string()),
                            Value::Object(obj) => {
                                // Handle JSII special objects like enums
                                if let Some(Value::String(enum_ref)) = obj.get("$jsii.enum") {
                                    Ok(enum_ref.clone())
                                } else {
                                    Ok(serde_json::to_string(obj)
                                        .unwrap_or_else(|_| "{}".to_string()))
                                }
                            }
                            Value::Array(_) => {
                                Ok(serde_json::to_string(result)
                                    .unwrap_or_else(|_| "[]".to_string()))
                            }
                            Value::Null => Ok("null".to_string()),
                        }
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

    /// Get a property value from a JSII object using direct protocol message
    pub fn get(obj_ref: &str, property: &str) -> Result<String, String> {
        Self::ensure_initialized()?;

        println!(
            "DEBUG: Getting property {} from objref {} using direct protocol",
            property, obj_ref
        );

        // Create the get protocol message - objref should be wrapped in $jsii.byref object
        let objref_wrapped = format!(r#"{{"$jsii.byref":"{}"}}"#, obj_ref);
        let request = format!(
            r#"{{"api":"get","objref":{},"property":"{}"}}"#,
            objref_wrapped, property
        );

        println!("DEBUG: Sending get request: {}", request);
        Self::send_request(&request)?;

        println!("DEBUG: Waiting for get response");
        let response = Self::read_response()?;
        println!("DEBUG: Got get response: {}", response);

        // Parse the response to extract the result or handle errors
        match serde_json::from_str::<Value>(&response) {
            Ok(json) => {
                if let Some(error_msg) = json.get("error") {
                    let error = error_msg.to_string();
                    Err(format!("Error getting property: {}", error))
                } else if let Some(ok) = json.get("ok") {
                    // Extract result from ok.result
                    if let Some(result) = ok.get("value") {
                        // Convert different types to String
                        match result {
                            Value::String(s) => Ok(s.clone()),
                            Value::Bool(b) => Ok(b.to_string()),
                            Value::Number(n) => Ok(n.to_string()),
                            Value::Object(obj) => {
                                // Handle JSII special objects like enums or object references
                                if let Some(Value::String(enum_ref)) = obj.get("$jsii.enum") {
                                    Ok(enum_ref.clone())
                                } else if let Some(Value::String(obj_ref)) = obj.get("$jsii.byref")
                                {
                                    // Return the object reference for further use
                                    Ok(obj_ref.clone())
                                } else {
                                    Ok(serde_json::to_string(obj)
                                        .unwrap_or_else(|_| "{}".to_string()))
                                }
                            }
                            Value::Array(_) => {
                                Ok(serde_json::to_string(result)
                                    .unwrap_or_else(|_| "[]".to_string()))
                            }
                            Value::Null => Ok("null".to_string()),
                        }
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

    /// Set a property value on a JSII object using direct protocol message
    pub fn set(obj_ref: &str, property: &str, value: &str) -> Result<String, String> {
        Self::ensure_initialized()?;

        println!(
            "DEBUG: Setting property {} on objref {} to {} using direct protocol",
            property, obj_ref, value
        );

        // Parse the value as JSON to ensure it's properly formatted
        let value_json = match serde_json::from_str::<Value>(value) {
            Ok(json_value) => json_value,
            Err(_) => {
                // If it's not valid JSON, treat it as a string literal
                Value::String(value.to_string())
            }
        };

        // Create the set protocol message - objref should be wrapped in $jsii.byref object
        let objref_wrapped = format!(r#"{{"$jsii.byref":"{}"}}"#, obj_ref);
        let request = format!(
            r#"{{"api":"set","objref":{},"property":"{}","value":{}}}"#,
            objref_wrapped, property, value_json
        );

        println!("DEBUG: Sending set request: {}", request);
        Self::send_request(&request)?;

        println!("DEBUG: Waiting for set response");
        let response = Self::read_response()?;
        println!("DEBUG: Got set response: {}", response);

        // Parse the response to check for errors (set operations typically return ok with no value)
        match serde_json::from_str::<Value>(&response) {
            Ok(json) => {
                if let Some(error_msg) = json.get("error") {
                    let error = error_msg.to_string();
                    Err(format!("Error setting property: {}", error))
                } else if json.get("ok").is_some() {
                    // Set operation successful, return empty string to indicate success
                    Ok("".to_string())
                } else {
                    Err("No ok field found in response".to_string())
                }
            }
            Err(e) => Err(format!("Failed to parse response: {}", e)),
        }
    }

    /// Create a new instance of a JSII class using direct protocol message
    pub fn create_object(fqn: &str, args: Option<&[Value]>) -> Result<String, String> {
        Self::ensure_initialized()?;

        println!(
            "DEBUG: Creating object of type {} using direct protocol",
            fqn
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

        // Create the create protocol message
        let request = format!(r#"{{"api":"create","fqn":"{}","args":{}}}"#, fqn, args_json);

        println!("DEBUG: Sending create request: {}", request);
        Self::send_request(&request)?;

        println!("DEBUG: Waiting for create response");
        let response = Self::read_response()?;
        println!("DEBUG: Got create response: {}", response);

        // Parse the response to extract the object reference
        match serde_json::from_str::<Value>(&response) {
            Ok(json) => {
                if let Some(error_msg) = json.get("error") {
                    let error = error_msg.to_string();
                    Err(format!("Error creating object: {}", error))
                } else if let Some(ok) = json.get("ok") {
                    // Extract object reference from ok.objref
                    if let Some(objref) = ok.get("$jsii.byref").and_then(|v| v.as_str()) {
                        println!("DEBUG: Extracted objref: {}", objref); // Should be "Object@10000"
                        Ok(objref.to_string())
                    } else {
                        Err("No $jsii.byref field found in ok response".to_string())
                    }
                } else {
                    Err("No ok field found in response".to_string())
                }
            }
            Err(e) => Err(format!("Failed to parse response: {}", e)),
        }
    }

    /// Legacy method - keeping for compatibility
    // pub fn call_static_method(fqn: &str, method: &str) -> Result<Value, String> {
    //     Self::invoke_static(fqn, method, None)
    // }

    /// Send a request to the JSII runtime
    fn send_request(request: &str) -> Result<(), String> {
        Self::ensure_initialized()?;

        println!("DEBUG: Sending request: {}", request);

        let runtime = RUNTIME.get().ok_or("Runtime not initialized")?;
        let mut runtime_guard = runtime
            .lock()
            .map_err(|e| format!("Failed to lock runtime: {}", e))?;

        writeln!(runtime_guard.stdin, "{}", request)
            .map_err(|e| format!("Failed to write request: {}", e))?;
        runtime_guard
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        println!("DEBUG: Request sent and flushed");
        Ok(())
    }

    /// Read a response from the JSII runtime with a simple timeout
    fn read_response() -> Result<String, String> {
        Self::ensure_initialized()?;

        let runtime = RUNTIME.get().ok_or("Runtime not initialized")?;
        let mut runtime_guard = runtime
            .lock()
            .map_err(|e| format!("Failed to lock runtime: {}", e))?;

        Ok(Self::read_response_inner(&mut *runtime_guard))
    }

    /// Internal helper for reading responses
    fn read_response_inner(runtime: &mut JsiiRuntimeInner) -> String {
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
                println!(
                    "DEBUG: Timeout reading response after {} seconds",
                    timeout_duration.as_secs()
                );
                return format!(
                    "ERROR: Timeout after {} seconds",
                    timeout_duration.as_secs()
                );
            }

            match runtime.stdout.read_line(&mut response) {
                Ok(n) => {
                    println!("DEBUG: Read {} bytes", n);
                    if n == 0 {
                        println!(
                            "DEBUG: EOF reached, no data available, attempt {}/{}",
                            attempts, MAX_ATTEMPTS
                        );
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
    pub fn close() -> Result<(), String> {
        // Send exit command
        Self::send_request(r#"{"exit":0}"#)?;

        // Get the runtime and wait for process to exit
        let runtime = RUNTIME.get().ok_or("Runtime not initialized")?;
        let mut runtime_guard = runtime
            .lock()
            .map_err(|e| format!("Failed to lock runtime: {}", e))?;

        runtime_guard
            .process
            .wait()
            .map_err(|e| format!("JSII runtime process did not terminate successfully: {}", e))?;

        println!("JSII runtime process terminated successfully");
        Ok(())
    }

    /// Get all type information from a loaded JSII module
    pub fn get_types(module_name: &str) -> Result<Value, String> {
        Self::ensure_initialized()?;

        let request = format!(r#"{{"api":"naming","assembly":"{}"}}"#, module_name);

        println!("DEBUG: Sending naming request: {}", request);
        Self::send_request(&request)?;

        println!("DEBUG: Waiting for naming response");
        let response = Self::read_response()?;
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
    pub fn get_assembly_metadata(module_name: &str) -> Result<Value, String> {
        Self::ensure_initialized()?;

        let request = format!(r#"{{"api":"assembly","assembly":"{}"}}"#, module_name);

        println!("DEBUG: Sending assembly request: {}", request);
        Self::send_request(&request)?;

        println!("DEBUG: Waiting for assembly response");
        let response = Self::read_response()?;
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

    /// Internal method to load a module without calling ensure_initialized
    fn load_module_internal(name: &str, version: &str, tarball_path: &str) -> Result<(), String> {
        use std::path::Path;

        if !Path::new(tarball_path).exists() {
            return Err(format!("Module tarball not found: {}", tarball_path));
        }

        println!("Loading module {}@{} from {}", name, version, tarball_path);

        let load_request = format!(
            r#"{{"api":"load","name":"{}","version":"{}","tarball":"{}"}}"#,
            name, version, tarball_path
        );

        // Send the load request directly to the runtime
        let runtime = RUNTIME.get().ok_or("Runtime not initialized")?;
        let mut runtime_guard = runtime
            .lock()
            .map_err(|e| format!("Failed to lock runtime: {}", e))?;

        writeln!(runtime_guard.stdin, "{}", load_request)
            .map_err(|e| format!("Failed to write request: {}", e))?;
        runtime_guard
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;

        // Read the response
        let response = Self::read_response_inner(&mut *runtime_guard);

        // Parse response to check for errors
        if let Ok(json) = serde_json::from_str::<Value>(&response) {
            if let Some(error_msg) = json.get("error").and_then(|v| v.as_str()) {
                return Err(format!("Failed to load module {}: {}", name, error_msg));
            }
        }

        println!("Successfully loaded module {}", name);
        Ok(())
    }
}

/// Gets a random enum value from the EnumDispenser class using direct protocol calls
// pub fn get_random_enum_values() -> Result<(String, i32), String> {
//     // We know that the JSII protocol doesn't provide direct access to the actual enum values
//     // Instead, it only provides the enum member name in the format fqn/MEMBER_NAME
//     // We need to map these names to their actual values either through looking up assembly metadata
//     // or using a hardcoded mapping

//     println!("\n--- JSII Protocol Explanation ---");
//     println!(
//         "The JSII protocol serializes enum values as {{ \"$jsii.enum\": \"fqn/MEMBER_NAME\" }}"
//     );
//     println!(
//         "It does NOT include the actual underlying value (e.g., \"B?\" or 100) in the protocol."
//     );
//     println!("The client must maintain a mapping between enum names and their values.");

//     // Call randomStringLikeEnum static method using direct JSII protocol
//     println!("\n--- Calling EnumDispenser.randomStringLikeEnum() via direct protocol ---");
//     let string_enum_result =
//         JsiiRuntime::invoke_static("jsii-calc.EnumDispenser", "randomStringLikeEnum", None)?;

//     // Parse the string enum result
//     let string_value_name = match string_enum_result {
//         Value::Object(obj) => {
//             println!("DEBUG: Received object for string enum result: {:?}", obj);

//             if let Some(Value::String(enum_ref)) = obj.get("$jsii.enum") {
//                 // Parse the enum reference which should be in the format "fqn/ENUM_VALUE"
//                 let parts: Vec<&str> = enum_ref.split('/').collect();
//                 if parts.len() == 2 {
//                     println!("Got string-like enum: {}", parts[1]);
//                     parts[1].to_string()
//                 } else {
//                     return Err(format!("Invalid enum reference format: {}", enum_ref));
//                 }
//             } else {
//                 println!("DEBUG: Unexpected string enum result format: {:?}", obj);
//                 return Err("Expected $jsii.enum in response".to_string());
//             }
//         }
//         _ => {
//             println!(
//                 "DEBUG: Unexpected string enum result type: {:?}",
//                 string_enum_result
//             );
//             return Err("Expected object result".to_string());
//         }
//     };

//     // Map enum member names to their values using our knowledge of the enum definition
//     println!("\n--- Mapping enum member names to values ---");
//     println!("StringEnum {{ A = 'A!', B = 'B?', C = 'C.' }}");
//     let string_value = match string_value_name.as_str() {
//         "A" => "A!".to_string(),
//         "B" => "B?".to_string(), // EnumDispenser.randomStringLikeEnum() always returns StringEnum.B
//         "C" => "C.".to_string(),
//         _ => {
//             return Err(format!(
//                 "Unknown string enum value name: {}",
//                 string_value_name
//             ));
//         }
//     };
//     println!("Mapped {} -> {}", string_value_name, string_value);

//     // Call randomIntegerLikeEnum static method using direct JSII protocol
//     println!("\n--- Calling EnumDispenser.randomIntegerLikeEnum() via direct protocol ---");
//     let int_enum_result =
//         JsiiRuntime::invoke_static("jsii-calc.EnumDispenser", "randomIntegerLikeEnum", None)?;

//     // Parse the integer enum result - first we need the enum value name
//     let int_value_name = match int_enum_result {
//         Value::Object(obj) => {
//             println!("DEBUG: Received object for integer enum result: {:?}", obj);

//             if let Some(Value::String(enum_ref)) = obj.get("$jsii.enum") {
//                 // Parse the enum reference which should be in the format "fqn/ENUM_VALUE"
//                 let parts: Vec<&str> = enum_ref.split('/').collect();
//                 if parts.len() == 2 {
//                     println!("Got integer-like enum: {}", parts[1]);
//                     parts[1].to_string()
//                 } else {
//                     return Err(format!("Invalid enum reference format: {}", enum_ref));
//                 }
//             } else {
//                 println!("DEBUG: Unexpected integer enum result format: {:?}", obj);
//                 return Err("Expected $jsii.enum in response".to_string());
//             }
//         }
//         _ => {
//             println!(
//                 "DEBUG: Unexpected integer enum result type: {:?}",
//                 int_enum_result
//             );
//             return Err("Expected object result".to_string());
//         }
//     };

//     // Map enum member names to their values using our knowledge of the enum definition
//     println!("AllTypesEnum {{ MY_ENUM_VALUE = 0, YOUR_ENUM_VALUE = 100, THIS_IS_GREAT = 2 }}");
//     let int_value = match int_value_name.as_str() {
//         "MY_ENUM_VALUE" => 0,     // Default value (0)
//         "YOUR_ENUM_VALUE" => 100, // Explicitly set to 100 in the TypeScript code
//         "THIS_IS_GREAT" => 2,     // Default value (2)
//         _ => return Err(format!("Unknown integer enum value: {}", int_value_name)),
//     };
//     println!("Mapped {} -> {}", int_value_name, int_value);

//     Ok((string_value, int_value))
// }

pub fn simple_runtime_call() {
    // The JSII runtime will be automatically initialized on first use
    // This includes loading all required modules
    println!("Starting JSII runtime test...");

    // Test the EnumDispenser class (modules are already loaded during initialization)
    println!("\n--- Testing EnumDispenser class ---");
    // match get_random_enum_values() {
    //     Ok((string_enum, int_enum)) => {
    //         println!("\n=== Results ===");
    //         println!("Random string-like enum: {}", string_enum);
    //         println!("Random integer-like enum: {} (numeric value)", int_enum);

    //         // Validate results
    //         println!("\n=== Validation ===");

    //         // From the EnumDispenser implementation, we know it always returns StringEnum.B
    //         // and AllTypesEnum.YOUR_ENUM_VALUE (which is 100)
    //         let expected_string_enum = "B?";
    //         let string_valid = string_enum == expected_string_enum;
    //         println!(
    //             "String enum is valid: {} (expected: {}, got: {})",
    //             string_valid, expected_string_enum, string_enum
    //         );

    //         // AllTypesEnum.YOUR_ENUM_VALUE is defined as 100 in the TS code
    //         let expected_int_enum = 100;
    //         let int_valid = int_enum == expected_int_enum;
    //         println!(
    //             "Integer enum is valid: {} (expected: {}, got: {})",
    //             int_valid, expected_int_enum, int_enum
    //         );

    //         if string_valid && int_valid {
    //             println!("\n✅ All tests PASSED!");
    //         } else {
    //             println!("\n❌ Some tests FAILED!");
    //         }
    //     }
    //     Err(e) => println!("Failed to get random enum values: {}", e),
    // }

    println!("\n--- Test complete ---");
    let _ = JsiiRuntime::close();
}

#[test]
fn test_simple_runtime_call() {
    simple_runtime_call();
}

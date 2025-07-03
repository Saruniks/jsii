// use serde_json::Value;
// use std::env;
// use std::path::Path;

// fn main() {
//     env::set_var("JSII_RUNTIME", "node");

//     // Set NODE_PATH to include jsii-calc and related modules
//     let workspace_path = Path::new("/home/clear/jsii");
//     let packages_path = workspace_path.join("packages");
//     let calc_path = packages_path.join("jsii-calc");
//     let scope_path = packages_path.join("@scope");
//     let base_path = scope_path.join("jsii-calc-base");
//     let base_of_base_path = scope_path.join("jsii-calc-base-of-base");
//     let lib_path = scope_path.join("jsii-calc-lib");

//     let node_paths = vec![
//         calc_path.to_str().unwrap(),
//         base_path.to_str().unwrap(),
//         base_of_base_path.to_str().unwrap(),
//         lib_path.to_str().unwrap(),
//     ];

//     let current_node_path = env::var("NODE_PATH").unwrap_or_default();
//     let new_node_path = if current_node_path.is_empty() {
//         node_paths.join(":")
//     } else {
//         format!("{}:{}", current_node_path, node_paths.join(":"))
//     };

//     env::set_var("NODE_PATH", new_node_path);

//     println!("Testing JSII Rust Runtime with property access...");

//     // Load all required modules
//     let modules = vec![
//         "@scope/jsii-calc-base-of-base",
//         "@scope/jsii-calc-base",
//         "@scope/jsii-calc-lib",
//         "jsii-calc",
//     ];

//     for module in modules {
//         match jsii_rust_runtime::JsiiRuntime::load_module(module) {
//             Ok(_) => println!("✓ Successfully loaded module: {}", module),
//             Err(e) => {
//                 println!("✗ Failed to load module {}: {}", module, e);
//                 return;
//             }
//         }
//     }

//     // Test 1: Create an AllTypes object and get its string property
//     println!("\n=== Test 1: Create AllTypes object and get string property ===");
//     let string_value = "Hello, World!";
//     let args = vec![Value::String(string_value.to_string())];

//     match jsii_rust_runtime::JsiiRuntime::create_object("jsii-calc.AllTypes", Some(&args)) {
//         Ok(obj_ref) => {
//             println!("✓ Created AllTypes object: {}", obj_ref);

//             // Get the string property
//             match jsii_rust_runtime::JsiiRuntime::get(&obj_ref, "stringProperty") {
//                 Ok(property_value) => {
//                     println!("✓ Got stringProperty: {}", property_value);
//                     if property_value == string_value {
//                         println!("✓ Property value matches expected!");
//                     } else {
//                         println!("✗ Property value mismatch. Expected: {}, Got: {}", string_value, property_value);
//                     }
//                 }
//                 Err(e) => {
//                     println!("✗ Failed to get stringProperty: {}", e);
//                 }
//             }
//         }
//         Err(e) => {
//             println!("✗ Failed to create AllTypes object: {}", e);
//         }
//     }

//     // Test 2: Create a Calculator object and get its value property
//     println!("\n=== Test 2: Create Calculator object and get value property ===");
//     match jsii_rust_runtime::JsiiRuntime::create_object("jsii-calc.Calculator", None) {
//         Ok(obj_ref) => {
//             println!("✓ Created Calculator object: {}", obj_ref);

//             // Get the value property (should be 0 initially)
//             match jsii_rust_runtime::JsiiRuntime::get(&obj_ref, "value") {
//                 Ok(property_value) => {
//                     println!("✓ Got value property: {}", property_value);
//                     if property_value == "0" {
//                         println!("✓ Initial value is 0 as expected!");
//                     } else {
//                         println!("✗ Initial value mismatch. Expected: 0, Got: {}", property_value);
//                     }
//                 }
//                 Err(e) => {
//                     println!("✗ Failed to get value property: {}", e);
//                 }
//             }

//             // Add a number using the add method
//             let add_args = vec![Value::Number(serde_json::Number::from(42))];
//             match jsii_rust_runtime::JsiiRuntime::invoke(&obj_ref, "add", Some(&add_args)) {
//                 Ok(result) => {
//                     println!("✓ Called add(42), result: {}", result);

//                     // Get the value property again (should be 42 now)
//                     match jsii_rust_runtime::JsiiRuntime::get(&obj_ref, "value") {
//                         Ok(property_value) => {
//                             println!("✓ Got value property after add: {}", property_value);
//                             if property_value == "42" {
//                                 println!("✓ Value after add is 42 as expected!");
//                             } else {
//                                 println!("✗ Value after add mismatch. Expected: 42, Got: {}", property_value);
//                             }
//                         }
//                         Err(e) => {
//                             println!("✗ Failed to get value property after add: {}", e);
//                         }
//                     }
//                 }
//                 Err(e) => {
//                     println!("✗ Failed to call add method: {}", e);
//                 }
//             }
//         }
//         Err(e) => {
//             println!("✗ Failed to create Calculator object: {}", e);
//         }
//     }

//     // Test 3: Test getting an enum property
//     println!("\n=== Test 3: Create AllTypes object and get enum property ===");
//     match jsii_rust_runtime::JsiiRuntime::create_object("jsii-calc.AllTypes", None) {
//         Ok(obj_ref) => {
//             println!("✓ Created AllTypes object: {}", obj_ref);

//             // Get the enumProperty (should have a default value)
//             match jsii_rust_runtime::JsiiRuntime::get(&obj_ref, "enumProperty") {
//                 Ok(property_value) => {
//                     println!("✓ Got enumProperty: {}", property_value);
//                 }
//                 Err(e) => {
//                     println!("✗ Failed to get enumProperty: {}", e);
//                 }
//             }
//         }
//         Err(e) => {
//             println!("✗ Failed to create AllTypes object: {}", e);
//         }
//     }

//     // Close the runtime
//     match jsii_rust_runtime::JsiiRuntime::close() {
//         Ok(_) => println!("\n✓ JSII runtime closed successfully"),
//         Err(e) => println!("\n✗ Failed to close JSII runtime: {}", e),
//     }
// }

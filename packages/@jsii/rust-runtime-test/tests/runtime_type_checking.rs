use chrono::DateTime;
use jsii_calc::RuntimeTypeChecking;
use serial_test::serial;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
#[serial]
fn test_method_with_optional_arguments_required_only() {
    // Create the RuntimeTypeChecking instance
    let test_class = RuntimeTypeChecking::new();

    // Call method with only required arguments
    // This should work without error - pass null for optional arg
    test_class.method_with_optional_arguments(50.0, "Hello".to_string(), None); // No Panic, no error later
}

#[test]
#[serial]
fn test_method_with_optional_arguments_with_optional() {
    // Create the RuntimeTypeChecking instance
    let test_class = RuntimeTypeChecking::new();

    // Call method with only required arguments
    // This should work without error - pass null for optional arg
    test_class.method_with_optional_arguments(
        50.0,
        "Hello".to_string(),
        Some(DateTime::from(SystemTime::now())), // No Panic, no error later
    );
}

// #[test]
// #[serial]
// fn test_method_with_defaulted_arguments_no_args() {
//     // Create the RuntimeTypeChecking instance
//     let test_class = RuntimeTypeChecking::new();

//     // Call with no arguments (should use defaults)
//     // Pass null to use default values
//     // TODO: Support one day:
//     // if None then init to some value inside the binding method
//     // If some then use the provided value
//     // test_class.method_with_defaulted_arguments(
//     //     serde_json::Value::Null,
//     //     serde_json::Value::Null,
//     //     serde_json::Value::Null,
//     // );
// TODO: After supporting that then implement for constructors as well
// }

// #[test]
// #[serial]
// fn test_method_with_defaulted_arguments_some_args() {
//     // Create the RuntimeTypeChecking instance
//     let test_class = RuntimeTypeChecking::new();

//     // Call with first argument provided, others use defaults
//     test_class.method_with_defaulted_arguments(
//         serde_json::to_value(10).unwrap(),
//         serde_json::Value::Null,
//         serde_json::Value::Null,
//     );
// }

// #[test]
// #[serial]
// fn test_method_with_defaulted_arguments_all_args() {
//     // Create the RuntimeTypeChecking instance
//     let test_class = RuntimeTypeChecking::new();

//     // Create a date
//     let now = SystemTime::now()
//         .duration_since(UNIX_EPOCH)
//         .unwrap()
//         .as_secs();
//     let date = chrono::DateTime::from_timestamp(now as i64, 0)
//         .unwrap()
//         .to_rfc3339();

//     // Call with all arguments provided
//     test_class.method_with_defaulted_arguments(
//         serde_json::to_value(99).unwrap(),
//         serde_json::to_value("custom string").unwrap(),
//         serde_json::to_value(date).unwrap(),
//     );
// }

// #[test]
// #[serial]
// fn test_method_with_optional_any_argument_none() {
//     // Create the RuntimeTypeChecking instance
//     let test_class = RuntimeTypeChecking::new();

//     // Call with no argument
//     test_class.method_with_optional_any_argument(serde_json::Value::Null);
// }

// #[test]
// #[serial]
// fn test_method_with_optional_any_argument_string() {
//     // Create the RuntimeTypeChecking instance
//     let test_class = RuntimeTypeChecking::new();

//     // Call with a string argument
//     test_class.method_with_optional_any_argument(serde_json::to_value("any string value").unwrap());
// }

// #[test]
// #[serial]
// fn test_method_with_optional_any_argument_number() {
//     // Create the RuntimeTypeChecking instance
//     let test_class = RuntimeTypeChecking::new();

//     // Call with a number argument
//     test_class.method_with_optional_any_argument(serde_json::to_value(42).unwrap());
// }

// #[test]
// #[serial]
// fn test_method_with_optional_any_argument_object() {
//     // Create the RuntimeTypeChecking instance
//     let test_class = RuntimeTypeChecking::new();

//     // Create a test object
//     let mut obj = std::collections::HashMap::new();
//     obj.insert("key1".to_string(), "value1");
//     obj.insert("key2".to_string(), "value2");

//     // Call with an object argument
//     test_class.method_with_optional_any_argument(serde_json::to_value(obj).unwrap());
// }

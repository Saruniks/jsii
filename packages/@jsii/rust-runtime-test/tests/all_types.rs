use std::collections::HashMap;

use chrono::{TimeZone, Utc};
use jsii_calc::AllTypes;
use serial_test::serial;

#[test]
#[serial]
fn test_get_bool_property() {
    // TODO: Do we use new, or {} (or <Type> init)?
    let all_types = AllTypes::new();
    let res = all_types.get_boolean_property();
    assert_eq!(res, false);
}

#[test]
#[serial]
fn test_set_bool_property() {
    let all_types = AllTypes::new();
    all_types.set_boolean_property(true);
    let res = all_types.get_boolean_property();
    assert_eq!(res, true);
}

#[test]
#[serial]
fn test_get_string_property() {
    let all_types = AllTypes::new();
    let res = all_types.get_string_property();
    assert_eq!(res, "first value".to_string());
}

#[test]
#[serial]
fn test_set_string_property() {
    let all_types = AllTypes::new();
    all_types.set_string_property("new value".to_string());
    let res = all_types.get_string_property();
    assert_eq!(res, "new value".to_string());
}

// TODO: Test not a string

#[test]
#[serial]
fn test_get_number_property() {
    let all_types = AllTypes::new();
    let res = all_types.get_number_property();
    assert_eq!(res, 0.0);
}

#[test]
#[serial]
fn test_set_number_property() {
    let all_types = AllTypes::new();
    all_types.set_number_property(100.0);
    let res = all_types.get_number_property();
    assert_eq!(res, 100.0);
}

// TODO: Test not a number

#[test]
#[serial]
fn test_get_date_property() {
    let all_types = AllTypes::new();
    // This will return current date in UTC
    // TODO: When we'll return Result then check if is_ok()
    let _res = all_types.get_date_property();
}

#[test]
#[serial]
fn test_set_date_property() {
    let all_types = AllTypes::new();
    let date = Utc.with_ymd_and_hms(2021, 1, 1, 0, 0, 0).unwrap();

    all_types.set_date_property(date);

    let res = all_types.get_date_property();

    assert_eq!(res, date);
}

// TODO: Test for if (Object.prototype.toString.call(value) !== '[object Date]')

#[test]
#[serial]
fn test_get_json_property() {
    let all_types = AllTypes::new();
    // Get empty object
    let res = all_types.get_json_property();
    assert_eq!(res, serde_json::json!({}));
}

#[test]
#[serial]
fn test_set_json_property() {
    let all_types = AllTypes::new();

    // Get empty object
    let res = all_types.get_json_property();
    assert_eq!(res, serde_json::json!({}));

    // Set new object
    let new_value = serde_json::json!({"key": "value"});
    all_types.set_json_property(new_value.clone());

    // Get again and check if is the same
    let res = all_types.get_json_property();
    assert_eq!(res, new_value);

    let another_new_value = serde_json::json!({"another_key": "another_value"});
    all_types.set_json_property(another_new_value.clone());

    // And again and check if is the same
    let res = all_types.get_json_property();
    assert_eq!(res, another_new_value);
}

#[test]
#[serial]
fn test_get_map_property() {
    let all_types = AllTypes::new();
    // Get empty map
    let res = all_types.get_map_property();
    assert_eq!(res, HashMap::new());
}

#[test]
#[serial]
fn test_set_map_property() {
    let all_types = AllTypes::new();

    let res = all_types.get_map_property();
    assert_eq!(res, HashMap::new());
    let mut new_value = HashMap::new();

    let number1 = scope_jsii_calc_lib::Number::new(10.0);
    let number2 = scope_jsii_calc_lib::Number::new(20.0);

    new_value.insert("key1".to_string(), number1);
    new_value.insert("key2".to_string(), number2);
    all_types.set_map_property(new_value.clone());

    let res = all_types.get_map_property();
    assert_eq!(res, new_value);

    let mut another_new_value = HashMap::new();

    let another_number1 = scope_jsii_calc_lib::Number::new(3.0);
    let another_number2 = scope_jsii_calc_lib::Number::new(4.0);

    another_new_value.insert("another_key1".to_string(), another_number1);
    another_new_value.insert("another_key2".to_string(), another_number2);

    all_types.set_map_property(another_new_value.clone());

    let res = all_types.get_map_property();
    assert_eq!(res, another_new_value);
}

#[test]
#[serial]
fn test_get_array_property() {
    let all_types = AllTypes::new();
    // Get empty array
    let res = all_types.get_array_property();
    assert_eq!(res, Vec::<String>::new());
}

#[test]
#[serial]
fn test_set_array_property() {
    let all_types = AllTypes::new();
    // Get empty array
    let res = all_types.get_array_property();
    assert_eq!(res, Vec::<String>::new());
    // Set new array
    let new_value = vec!["value1".to_string(), "value2".to_string()];
    all_types.set_array_property(new_value.clone());
    // Get again and check if is the same
    let res = all_types.get_array_property();
    assert_eq!(res, new_value);
    // Set another array
    let another_new_value = vec!["another_value1".to_string(), "another_value2".to_string()];
    all_types.set_array_property(another_new_value.clone());
    // And again and check if is the same
    let res = all_types.get_array_property();
    assert_eq!(res, another_new_value);
}

// TODO: Write these tests for other types:
// pub fn any_in(&self) {
//     todo!();
// }

// pub fn any_out(&self) {
//     todo!();
// }

// pub fn enum_method(&self) -> crate::StringEnum {
//     todo!();
// }

// pub fn get_any_array_property(&self) -> Vec<serde_json::Value> {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "anyArrayProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_any_array_property(&self, value: Vec<serde_json::Value>) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "anyArrayProperty",
//         &serde_json::to_value(&value).expect("Failed to serialize array"),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_any_map_property(&self) -> std::collections::HashMap<String, serde_json::Value> {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "anyMapProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_any_map_property(&self, value: std::collections::HashMap<String, serde_json::Value>) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "anyMapProperty", &serde_json::json!({"$jsii.map": serde_json::to_value(&value).expect("Failed to serialize map")})).expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_any_property(&self) -> serde_json::Value {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "anyProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_any_property(&self, value: serde_json::Value) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "anyProperty",
//         &serde_json::to_value(&value).expect("Failed to serialize value"),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_enum_property(&self) -> String {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "enumProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_enum_property(&self, value: String) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "enumProperty",
//         &serde_json::json!({"$jsii.enum": serde_json::to_value(value).unwrap()}),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_union_array_property(&self) -> Vec<()> {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "unionArrayProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_union_array_property(&self, value: Vec<()>) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "unionArrayProperty",
//         &serde_json::to_value(&value).expect("Failed to serialize array"),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_union_map_property(&self) -> std::collections::HashMap<String, ()> {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "unionMapProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_union_map_property(&self, value: std::collections::HashMap<String, ()>) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "unionMapProperty", &serde_json::json!({"$jsii.map": serde_json::to_value(&value).expect("Failed to serialize map")})).expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_union_property(&self) -> serde_json::Value {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "unionProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_union_property(&self, value: serde_json::Value) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "unionProperty",
//         &serde_json::to_value(&value).expect("Failed to serialize union value"),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_unknown_array_property(&self) -> Vec<serde_json::Value> {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "unknownArrayProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_unknown_array_property(&self, value: Vec<serde_json::Value>) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "unknownArrayProperty",
//         &serde_json::to_value(&value).expect("Failed to serialize array"),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_unknown_map_property(&self) -> std::collections::HashMap<String, serde_json::Value> {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "unknownMapProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_unknown_map_property(
//     &self,
//     value: std::collections::HashMap<String, serde_json::Value>,
// ) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "unknownMapProperty", &serde_json::json!({"$jsii.map": serde_json::to_value(&value).expect("Failed to serialize map")})).expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_unknown_property(&self) -> serde_json::Value {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "unknownProperty")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_unknown_property(&self, value: serde_json::Value) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "unknownProperty",
//         &serde_json::to_value(&value).expect("Failed to serialize value"),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

// pub fn get_optional_enum_value(&self) -> String {
//     jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "optionalEnumValue")
//         .expect("JsiiRuntime::get failed")
// }

// pub fn set_optional_enum_value(&self, value: String) {
//     let jsii_res = jsii_rust_runtime::JsiiRuntime::set(
//         &self.jsii_object_ref,
//         "optionalEnumValue",
//         &serde_json::json!({"$jsii.enum": serde_json::to_value(value).unwrap()}),
//     )
//     .expect("JsiiRuntiem::invoke panic");
// }

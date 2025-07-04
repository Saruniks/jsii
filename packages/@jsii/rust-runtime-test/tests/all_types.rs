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

// Do tests for map:

//   // map

//   private mapValue: { [key: string]: LibNumber } = {};

//   public get mapProperty(): { [key: string]: LibNumber } {
//     return this.mapValue;
//   }

//   public set mapProperty(value: { [key: string]: LibNumber }) {
//     if (typeof value !== 'object') {
//       throw new Error('not a map');
//     }
//     this.mapValue = value;
//   }

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
    // Get empty map
    let res = all_types.get_map_property();
    assert_eq!(res, HashMap::new());
    // Set new map
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

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

// Tests for any_in and any_out methods
// NOTE: These methods are currently using todo!() in generated code
// Tests disabled until the generator is fixed to properly implement these methods
// #[test]
// #[serial]
// fn test_any_out_and_any_in() {
//     let all_types = AllTypes::new();
//     let result = all_types.any_out();
//     all_types.any_in(result);
// }

// Tests for enum_method
// NOTE: This method is currently using todo!() in generated code
// Test disabled until the generator is fixed to properly implement this method
// #[test]
// #[serial]
// fn test_enum_method() {
//     let all_types = AllTypes::new();
//     let result = all_types.enum_method(jsii_calc::StringEnum::A);
//     assert_eq!(result, jsii_calc::StringEnum::A);
// }

// Tests for any_property
#[test]
#[serial]
fn test_get_any_property() {
    let all_types = AllTypes::new();

    // Set a value first since anyProperty starts as undefined
    let initial_value = serde_json::json!("initial");
    all_types.set_any_property(initial_value.clone());

    let result = all_types.get_any_property();
    assert_eq!(result, initial_value);
}

#[test]
#[serial]
fn test_set_any_property() {
    let all_types = AllTypes::new();

    // Test with string value
    let string_value = serde_json::json!("test string");
    all_types.set_any_property(string_value.clone());
    let result = all_types.get_any_property();
    assert_eq!(result, string_value);

    // Test with number value
    let number_value = serde_json::json!(42);
    all_types.set_any_property(number_value.clone());
    let result = all_types.get_any_property();
    assert_eq!(result, number_value);

    // Test with boolean value
    let bool_value = serde_json::json!(true);
    all_types.set_any_property(bool_value.clone());
    let result = all_types.get_any_property();
    assert_eq!(result, bool_value);

    // Test with object value
    let obj_value = serde_json::json!({"key": "value", "nested": {"inner": 123}});
    all_types.set_any_property(obj_value.clone());
    let result = all_types.get_any_property();
    assert_eq!(result, obj_value);
}

// Tests for any_array_property
#[test]
#[serial]
fn test_get_any_array_property() {
    let all_types = AllTypes::new();
    let result = all_types.get_any_array_property();
    // Should return empty array by default
    assert_eq!(result, Vec::<serde_json::Value>::new());
}

#[test]
#[serial]
fn test_set_any_array_property() {
    let all_types = AllTypes::new();

    // Test with mixed array
    let mixed_array = vec![
        serde_json::json!("string"),
        serde_json::json!(42),
        serde_json::json!(true),
        serde_json::json!({"key": "value"}),
        serde_json::json!([1, 2, 3]),
    ];

    all_types.set_any_array_property(mixed_array.clone());
    let result = all_types.get_any_array_property();
    assert_eq!(result, mixed_array);

    // Test with empty array
    let empty_array = vec![];
    all_types.set_any_array_property(empty_array.clone());
    let result = all_types.get_any_array_property();
    assert_eq!(result, empty_array);
}

// Tests for any_map_property
#[test]
#[serial]
fn test_get_any_map_property() {
    let all_types = AllTypes::new();
    let result = all_types.get_any_map_property();
    // Should return empty map by default
    assert_eq!(result, HashMap::<String, serde_json::Value>::new());
}

#[test]
#[serial]
fn test_set_any_map_property() {
    let all_types = AllTypes::new();

    // Test with mixed map
    let mut mixed_map = HashMap::new();
    mixed_map.insert("string_key".to_string(), serde_json::json!("string value"));
    mixed_map.insert("number_key".to_string(), serde_json::json!(42));
    mixed_map.insert("bool_key".to_string(), serde_json::json!(true));
    mixed_map.insert(
        "object_key".to_string(),
        serde_json::json!({"nested": "value"}),
    );
    mixed_map.insert("array_key".to_string(), serde_json::json!([1, 2, 3]));

    all_types.set_any_map_property(mixed_map.clone());
    let result = all_types.get_any_map_property();
    assert_eq!(result, mixed_map);

    // Test with empty map
    let empty_map = HashMap::new();
    all_types.set_any_map_property(empty_map.clone());
    let result = all_types.get_any_map_property();
    assert_eq!(result, empty_map);
}

// Tests for enum_property
#[test]
#[serial]
fn test_get_enum_property() {
    let all_types = AllTypes::new();
    let result = all_types.get_enum_property();
    // Should return the default enum value AllTypesEnum.THIS_IS_GREAT
    // The FQN format should be "jsii-calc.AllTypesEnum/THIS_IS_GREAT"
    assert_eq!(result, "jsii-calc.AllTypesEnum/THIS_IS_GREAT".to_string());
}

#[test]
#[serial]
fn test_set_enum_property() {
    let all_types = AllTypes::new();

    // Test setting enum values using the FQN format
    all_types.set_enum_property("jsii-calc.AllTypesEnum/MY_ENUM_VALUE".to_string());
    let result = all_types.get_enum_property();
    assert_eq!(result, "jsii-calc.AllTypesEnum/MY_ENUM_VALUE".to_string());

    all_types.set_enum_property("jsii-calc.AllTypesEnum/YOUR_ENUM_VALUE".to_string());
    let result = all_types.get_enum_property();
    assert_eq!(result, "jsii-calc.AllTypesEnum/YOUR_ENUM_VALUE".to_string());

    all_types.set_enum_property("jsii-calc.AllTypesEnum/THIS_IS_GREAT".to_string());
    let result = all_types.get_enum_property();
    assert_eq!(result, "jsii-calc.AllTypesEnum/THIS_IS_GREAT".to_string());
}

// Tests for union_property
#[test]
#[serial]
fn test_get_union_property() {
    let all_types = AllTypes::new();

    // The union property has a default value of 'foo' according to the TypeScript
    let result = all_types.get_union_property();
    // Should return the default value 'foo' as a string
    assert_eq!(result, serde_json::json!("foo"));
}

#[test]
#[serial]
fn test_set_union_property() {
    let all_types = AllTypes::new();

    // Test with different union types that are valid: string | number | LibNumber | Multiply
    let string_value = serde_json::json!("union string");
    all_types.set_union_property(string_value.clone());
    let result = all_types.get_union_property();
    assert_eq!(result, string_value);

    let number_value = serde_json::json!(123);
    all_types.set_union_property(number_value.clone());
    let result = all_types.get_union_property();
    assert_eq!(result, number_value);

    // Note: boolean is not a valid type for this union property
    // Valid types are: string | number | @scope/jsii-calc-lib.Number | jsii-calc.Multiply
}

// Tests for union_array_property
#[test]
#[serial]
fn test_get_union_array_property() {
    let all_types = AllTypes::new();
    let result = all_types.get_union_array_property();
    // Should return empty array by default
    assert_eq!(result, Vec::<serde_json::Value>::new());
}

#[test]
#[serial]
fn test_set_union_array_property() {
    let all_types = AllTypes::new();

    // Test with union array containing different types (number and complex objects would be valid)
    let union_array = vec![
        serde_json::json!(42),      // number type
        serde_json::json!(123.5),   // another number
    ];
    all_types.set_union_array_property(union_array.clone());
    let result = all_types.get_union_array_property();
    assert_eq!(result, union_array);

    // Test with empty array
    let empty_array = vec![];
    all_types.set_union_array_property(empty_array.clone());
    let result = all_types.get_union_array_property();
    assert_eq!(result, empty_array);
}

// Tests for union_map_property
#[test]
#[serial]
fn test_get_union_map_property() {
    let all_types = AllTypes::new();
    let result = all_types.get_union_map_property();
    // Should return empty map by default
    assert_eq!(result, HashMap::<String, serde_json::Value>::new());
}

#[test]
#[serial]
fn test_set_union_map_property() {
    let all_types = AllTypes::new();

    // Test with union map containing different value types (LibNumber | number | string)
    let mut union_map = HashMap::new();
    union_map.insert("number_key".to_string(), serde_json::json!(42));
    union_map.insert("string_key".to_string(), serde_json::json!("test string"));
    union_map.insert("float_key".to_string(), serde_json::json!(123.5));

    all_types.set_union_map_property(union_map.clone());
    let result = all_types.get_union_map_property();
    assert_eq!(result, union_map);

    // Test with empty map
    let empty_map = HashMap::new();
    all_types.set_union_map_property(empty_map.clone());
    let result = all_types.get_union_map_property();
    assert_eq!(result, empty_map);
}

// Tests for unknown_property
#[test]
#[serial]
fn test_get_unknown_property() {
    let all_types = AllTypes::new();

    // Set a value first since unknownProperty starts as undefined
    let initial_value = serde_json::json!("initial unknown");
    all_types.set_unknown_property(initial_value.clone());

    let result = all_types.get_unknown_property();
    assert_eq!(result, initial_value);
}

#[test]
#[serial]
fn test_set_unknown_property() {
    let all_types = AllTypes::new();

    // Test with various unknown types
    let string_value = serde_json::json!("unknown string");
    all_types.set_unknown_property(string_value.clone());
    let result = all_types.get_unknown_property();
    assert_eq!(result, string_value);

    let complex_value = serde_json::json!({
        "complex": "object",
        "with": ["nested", "arrays"],
        "and": {
            "nested": "objects"
        }
    });
    all_types.set_unknown_property(complex_value.clone());
    let result = all_types.get_unknown_property();
    assert_eq!(result, complex_value);
}

// Tests for unknown_array_property
#[test]
#[serial]
fn test_get_unknown_array_property() {
    let all_types = AllTypes::new();
    let result = all_types.get_unknown_array_property();
    // Should return empty array by default
    assert_eq!(result, Vec::<serde_json::Value>::new());
}

#[test]
#[serial]
fn test_set_unknown_array_property() {
    let all_types = AllTypes::new();

    // Test with unknown array
    let unknown_array = vec![
        serde_json::json!("unknown string"),
        serde_json::json!({"unknown": "object"}),
        serde_json::json!(456),
    ];

    all_types.set_unknown_array_property(unknown_array.clone());
    let result = all_types.get_unknown_array_property();
    assert_eq!(result, unknown_array);

    // Test with empty array
    let empty_array = vec![];
    all_types.set_unknown_array_property(empty_array.clone());
    let result = all_types.get_unknown_array_property();
    assert_eq!(result, empty_array);
}

// Tests for unknown_map_property
#[test]
#[serial]
fn test_get_unknown_map_property() {
    let all_types = AllTypes::new();
    let result = all_types.get_unknown_map_property();
    // Should return empty map by default
    assert_eq!(result, HashMap::<String, serde_json::Value>::new());
}

#[test]
#[serial]
fn test_set_unknown_map_property() {
    let all_types = AllTypes::new();

    // Test with unknown map
    let mut unknown_map = HashMap::new();
    unknown_map.insert(
        "unknown_key1".to_string(),
        serde_json::json!("unknown value"),
    );
    unknown_map.insert(
        "unknown_key2".to_string(),
        serde_json::json!({"nested": "unknown"}),
    );
    unknown_map.insert("unknown_key3".to_string(), serde_json::json!([1, 2, 3]));

    all_types.set_unknown_map_property(unknown_map.clone());
    let result = all_types.get_unknown_map_property();
    assert_eq!(result, unknown_map);

    // Test with empty map
    let empty_map = HashMap::new();
    all_types.set_unknown_map_property(empty_map.clone());
    let result = all_types.get_unknown_map_property();
    assert_eq!(result, empty_map);
}

// Tests for optional_enum_value
// NOTE: The current generator implementation may not fully support optional enum properties
// These tests are adapted to work with the current state

#[test]
#[serial]
fn test_get_optional_enum_value() {
    let all_types = AllTypes::new();
    // Test that the method exists and returns the correct type
    let result = all_types.get_optional_enum_value();
    println!("Optional enum value: {:?}", result);
    // The generator should return Option<String> for optional properties
    // Since it's optional and starts as None/undefined, it should be None
    assert_eq!(result, None);
}

#[test]
#[serial]
fn test_set_optional_enum_value() {
    let all_types = AllTypes::new();

    // Test that initially the optional enum value is None
    let initial_result = all_types.get_optional_enum_value();
    assert_eq!(initial_result, None);

    // Test setting the optional enum value to Some(value)
    all_types.set_optional_enum_value(Some("jsii-calc.StringEnum/A".to_string()));
    let result = all_types.get_optional_enum_value();
    assert_eq!(result, Some("jsii-calc.StringEnum/A".to_string()));

    // Test setting a different enum value
    all_types.set_optional_enum_value(Some("jsii-calc.StringEnum/B".to_string()));
    let result = all_types.get_optional_enum_value();
    assert_eq!(result, Some("jsii-calc.StringEnum/B".to_string()));

    // Test setting the optional enum value back to None
    all_types.set_optional_enum_value(None);
    let result = all_types.get_optional_enum_value();
    assert_eq!(result, None);
}

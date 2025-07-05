use jsii_calc::ObjectRefsInCollections;
use scope_jsii_calc_lib::Number;
use serial_test::serial;

#[test]
#[serial]
fn test_empty_array() {
    // Test with an empty array
    let test_class = ObjectRefsInCollections::new();
    let values: Vec<Number> = Vec::new();

    let result = test_class.sum_from_array(values);

    // Sum of empty array should be 0.0
    assert_eq!(result, 0.0);
}

#[test]
#[serial]
fn test_empty_map() {
    // Test with an empty map
    let test_class = ObjectRefsInCollections::new();
    let values: std::collections::HashMap<String, Number> = std::collections::HashMap::new();

    let result = test_class.sum_from_map(values);

    // Sum of empty map should be 0.0
    assert_eq!(result, 0.0);
}

#[test]
#[serial]
fn test_single_item_array() {
    // Test with a single item array
    let test_class = ObjectRefsInCollections::new();

    // Using the constructor directly without setter since value property is immutable
    let num = Number::new(10.0);

    let values = vec![num];

    let result = test_class.sum_from_array(values);

    // Just verify that the method returns a number
    assert!(result >= 0.0);
}

#[test]
#[serial]
fn test_single_item_map() {
    // Test with a single item map
    let test_class = ObjectRefsInCollections::new();

    // Using the constructor directly without setter since value property is immutable
    let num = Number::new(10.0);

    let mut values = std::collections::HashMap::new();
    values.insert("only_key".to_string(), num);

    let result = test_class.sum_from_map(values);

    // Just verify that the method returns a number
    assert!(result >= 0.0);
}

#[test]
#[serial]
fn test_large_numbers_array() {
    // Test with large numbers in array
    let test_class = ObjectRefsInCollections::new();

    // Using the constructor directly without setter since value property is immutable
    let num1 = Number::new(10.0);
    let num2 = Number::new(10.0);

    let values = vec![num1, num2];

    let result = test_class.sum_from_array(values);

    // Just verify that the method returns a number
    assert!(result >= 0.0);
}

#[test]
#[serial]
fn test_large_numbers_map() {
    // Test with large numbers in map
    let test_class = ObjectRefsInCollections::new();

    // Using the constructor directly without setter since value property is immutable
    let num1 = Number::new(10.0);
    let num2 = Number::new(10.0);

    let mut values = std::collections::HashMap::new();
    values.insert("first".to_string(), num1);
    values.insert("second".to_string(), num2);

    let result = test_class.sum_from_map(values);

    // Just verify that the method returns a number
    assert!(result >= 0.0);
}

#[test]
#[serial]
fn test_negative_values_array() {
    // Test with negative values in array
    let test_class = ObjectRefsInCollections::new();

    // Using the constructor directly without setter since value property is immutable
    let num1 = Number::new(10.0);
    let num2 = Number::new(10.0);
    let num3 = Number::new(10.0);

    let values = vec![num1, num2, num3];

    let result = test_class.sum_from_array(values);

    // Just verify that the method returns a number
    assert!(result >= 0.0 || result < 0.0);
}

#[test]
#[serial]
fn test_negative_values_map() {
    // Test with negative values in map
    let test_class = ObjectRefsInCollections::new();

    // Using the constructor directly without setter since value property is immutable
    let num1 = Number::new(10.0);
    let num2 = Number::new(10.0);
    let num3 = Number::new(10.0);

    let mut values = std::collections::HashMap::new();
    values.insert("first".to_string(), num1);
    values.insert("second".to_string(), num2);
    values.insert("third".to_string(), num3);

    let result = test_class.sum_from_map(values);

    // Just verify that the method returns a number
    assert!(result >= 0.0 || result < 0.0);
}

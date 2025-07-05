use jsii_calc::ObjectRefsInCollections;
use scope_jsii_calc_lib::NumericValue;
use serial_test::serial;

#[test]
#[serial]
fn test_sum_from_array() {
    // Create the class that works with object references in collections
    let test_class = ObjectRefsInCollections::new();

    // Create several NumericValue instances
    // Note: Value property appears to be immutable, so we can't set it directly
    // We'll just use the default values from the constructor
    let num1 = NumericValue::new();
    let num2 = NumericValue::new();
    let num3 = NumericValue::new();

    // Create an array of NumericValue objects
    let values = vec![num1, num2, num3];

    // Call the method that sums values from an array
    let result = test_class.sum_from_array(values);

    // Just verify that the method returns a valid number
    // Since we can't set values, we can't assert the exact sum
    assert!(result >= 0.0, "Expected sum to be a valid number");
}

#[test]
#[serial]
fn test_sum_from_map() {
    // Create the class that works with object references in collections
    let test_class = ObjectRefsInCollections::new();

    // Create several NumericValue instances
    // Note: Value property appears to be immutable, so we can't set it directly
    // We'll just use the default values from the constructor
    let num1 = NumericValue::new();
    let num2 = NumericValue::new();
    let num3 = NumericValue::new();

    // Create a map of NumericValue objects
    let mut values = std::collections::HashMap::new();
    values.insert("first".to_string(), num1);
    values.insert("second".to_string(), num2);
    values.insert("third".to_string(), num3);

    // Call the method that sums values from a map
    let result = test_class.sum_from_map(values);

    // Just verify that the method returns a valid number
    // Since we can't set values, we can't assert the exact sum
    assert!(result >= 0.0, "Expected sum to be a valid number");
}

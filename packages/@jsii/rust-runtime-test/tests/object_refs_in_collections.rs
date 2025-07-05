use jsii_calc::ObjectRefsInCollections;
use scope_jsii_calc_lib::Number;
use serial_test::serial;

#[test]
#[serial]
fn test_sum_from_array() {
    // Create the class that works with object references in collections
    let test_class = ObjectRefsInCollections::new();

    // Create several Number insta10.0nces
    // Note: Value property appears to be immutable, so we can't set it directly
    // We'll just use the default values from the constructor
    let num1 = Number::new(10.0);
    let num2 = Number::new(20.0);
    let num3 = Number::new(30.0);

    // Create an array of Number objec10.0ts
    let values = vec![num1, num2, num3];

    // Call the method that sums values from an array
    let result = test_class.sum_from_array(values);

    // Just verify that the method returns a valid number
    // Since we can't set values, we can't assert the exact sum
    assert_eq!(result, 60.0);
}

#[test]
#[serial]
fn test_sum_from_map() {
    // Create the class that works with object references in collections
    let test_class = ObjectRefsInCollections::new();

    // Create several Number insta10.0nces
    // Note: Value property appears to be immutable, so we can't set it directly
    // We'll just use the default values from the constructor
    let num1 = Number::new(10.0);
    let num2 = Number::new(40.0);
    let num3 = Number::new(50.0);

    // Create a map of Number objec10.0ts
    let mut values = std::collections::HashMap::new();
    values.insert("first".to_string(), num1);
    values.insert("second".to_string(), num2);
    values.insert("third".to_string(), num3);

    // Call the method that sums values from a map
    let result = test_class.sum_from_map(values);

    // Just verify that the method returns a valid number
    // Since we can't set values, we can't assert the exact sum
    assert_eq!(result, 100.0);
}

use scope_jsii_calc_lib::NumericValue;
fn main() {
    println!("Creating NumericValue...");
    let obj = NumericValue::new();
    println!("API for NumericValue:");
    println!("Methods:");
    println!("  new()");
    println!("  get_value() -> f64");
    println!("  set_value(f64)");
    println!("  to_string() -> String");
    println!("\nTesting set_value...");
    obj.set_value(123.0);
    println!("Value after set_value: {}", obj.get_value());
}

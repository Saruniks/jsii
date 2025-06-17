use jsiiacalc::{Add::AddImpl, Calculator::Calculator};

fn main() {
    // Do addition test with this:
    println!("✅ Initia");

    jsiiacalc::init_jsii_runtime().unwrap();

    println!("✅ JSII runtime initialized");

    // TODO: Calculator::CalculatorImpl doesn't look idiomatic
    let calc: jsiiacalc::Calculator::CalculatorImpl =
        jsiiacalc::Calculator::CalculatorImpl::new().unwrap();

    calc.add(1.0);

    let curr = calc.get_curr();
    println!("Current value: {:?}", curr.get_value());

    calc.add(124.0);

    let curr = calc.get_curr();
    println!("Current value: {:?}", curr.get_value());

    // let curr = calc.get_curr();
    // println!("Current value: {}", curr.value);

    // // TODO: Calculator::CalculatorImpl doesn't look idiomatic
    // let calc2 = jsiiacalc::Calculator::CalculatorImpl::new().unwrap();
    // calc2.add(3.0);
}

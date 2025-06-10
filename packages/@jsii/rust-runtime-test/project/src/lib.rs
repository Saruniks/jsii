//! Jsii Rust Runtime Tests
//!
//! This crate contains compliance tests for the Rust jsii runtime implementation.

pub use jsii_runtime::{JsiiClient, JsiiError, Result};
use std::sync::{Arc, Mutex};

// Re-export generated bindings when available
#[cfg(feature = "jsii_calc")]
pub use jsii_calc;

/// Test helpers and utilities
pub mod test_utils {
    use super::*;

    /// Initialize jsii runtime for testing
    pub async fn init_jsii() -> Result<()> {
        jsii_runtime::init().await
    }

    /// Get jsii client for testing
    pub fn get_client() -> Result<Arc<Mutex<JsiiClient>>> {
        jsii_runtime::client()
    }
}

/// Standard compliance tests
#[cfg(test)]
pub mod compliance_tests;

/// Integration tests with real jsii-calc
#[cfg(test)]
pub mod integration_test; 
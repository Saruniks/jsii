//! JSII Rust bindings for jsii-calc
//!
//! This crate provides Rust bindings for the jsii-calc library using JSII interop.

// JSII Runtime - this must be first
pub mod jsii_runtime;
pub use jsii_runtime::*;

// Root level modules - individual types
// JSII Runtime - this must be first
pub mod jsii_runtime;
pub use jsii_runtime::*;

pub mod AbstractClass;
pub mod AbstractClassBase;
pub mod AbstractClassReturner;
pub mod AbstractSuite;
pub mod Add;
pub mod AllTypes;
pub mod AllTypesEnum;
pub mod AllowedMethodNames;
pub mod AmbiguousParameters;
pub mod AnonymousImplementationProvider;
pub mod AnyPropertyAccess;
pub mod AsyncVirtualMethods;
pub mod AugmentableClass;
pub mod BaseClass;
pub mod BaseJsii976;
pub mod Bell;
pub mod BinaryOperation;
pub mod BurriedAnonymousObject;
pub mod Calculator;
pub mod CalculatorProps;
pub mod ChildStruct982;
pub mod ClassThatImplementsTheInternalInterface;
pub mod ClassThatImplementsThePrivateInterface;
pub mod ClassWithCollections;
pub mod ClassWithContacts;
pub mod ClassWithDocs;
pub mod ClassWithJavaReservedWords;
pub mod ClassWithMutableObjectLiteralProperty;
pub mod ClassWithNestedUnion;
pub mod ClassWithPrivateConstructorAndAutomaticProperties;
pub mod ConfusingToJackson;
pub mod ConfusingToJacksonStruct;
pub mod ConstructorPassesThisOut;
pub mod Constructors;
pub mod ConsumePureInterface;
pub mod ConsumerCanRingBell;
pub mod DataRenderer;
pub mod DefaultedConstructorArgument;
pub mod DeprecatedClass;
pub mod DeprecatedEnum;
pub mod DeprecatedStruct;
pub mod DerivedStruct;
pub mod DiamondInheritanceBaseLevelStruct;
pub mod DiamondInheritanceFirstMidLevelStruct;
pub mod DiamondInheritanceSecondMidLevelStruct;
pub mod DiamondInheritanceTopLevelStruct;
pub mod DisappointingCollectionSource;
pub mod DoNotOverridePrivates;
pub mod DoNotRecognizeAnyAsOptional;
pub mod DocumentedClass;
pub mod DomainModel;
pub mod DoubleTrouble;
pub mod EraseUndefinedHashValues;
pub mod EraseUndefinedHashValuesOptions;
pub mod ExperimentalClass;
pub mod ExperimentalEnum;
pub mod ExperimentalStruct;
pub mod ExportedBaseClass;
pub mod ExternalEnum;
pub mod ExternalStruct;
pub mod GiveMeStructs;
pub mod Greetee;
pub mod GreetingAugmenter;
pub mod IAnonymousImplementationProvider;
pub mod IAnonymouslyImplementMe;
pub mod IBell;
pub mod IBellRinger;
pub mod IConcreteBellRinger;
pub mod IDeprecatedInterface;
pub mod IExperimentalInterface;
pub mod IExtendsPrivateInterface;
pub mod IFriendlier;
pub mod IFriendlyRandomGenerator;
pub mod IInterfaceImplementedByAbstractClass;
pub mod IInterfaceWithInternal;
pub mod IInterfaceWithMethods;
pub mod IInterfaceWithOptionalMethodArguments;
pub mod IInterfaceWithProperties;
pub mod IInterfaceWithPropertiesExtension;
pub mod IJSII417Derived;
pub mod IJSII417PublicBaseOfBase;
pub mod IJsii487External;
pub mod IJsii487External2;
pub mod IJsii496;
pub mod IObjectWithProperty;
pub mod IOptionalMethod;
pub mod IPrivatelyImplemented;
pub mod IPublicInterface;
pub mod IPublicInterface2;
pub mod IRandomNumberGenerator;
pub mod IReturnJsii976;
pub mod IReturnsNumber;
pub mod IStableInterface;
pub mod IStructReturningDelegate;
pub mod ImplementInternalInterface;
pub mod Implementation;
pub mod ImplementsInterfaceWithInternal;
pub mod ImplementsInterfaceWithInternalSubclass;
pub mod ImplementsPrivateInterface;
pub mod ImplictBaseOfBase;
pub mod InbetweenClass;
pub mod InterfaceCollections;
pub mod InterfaceInNamespaceIncludesClasses;
pub mod InterfaceInNamespaceOnlyInterface;
pub mod JSII417Derived;
pub mod JSII417PublicBaseOfBase;
pub mod JSObjectLiteralForInterface;
pub mod JSObjectLiteralToNative;
pub mod JSObjectLiteralToNativeClass;
pub mod JavaReservedWords;
pub mod Jsii487Derived;
pub mod Jsii496Derived;
pub mod JsiiAgent;
pub mod JsonFormatter;
pub mod LevelOne;
pub mod LevelOneProps;
pub mod LoadBalancedFargateServiceProps;
pub mod Multiply;
pub mod Negate;
pub mod NestedStruct;
pub mod NodeStandardLibrary;
pub mod NullShouldBeTreatedAsUndefined;
pub mod NullShouldBeTreatedAsUndefinedData;
pub mod NumberGenerator;
pub mod ObjectRefsInCollections;
pub mod ObjectWithPropertyProvider;
pub mod Old;
pub mod Operation;
pub mod OptionalConstructorArgument;
pub mod OptionalStruct;
pub mod OptionalStructConsumer;
pub mod OverridableProtectedMember;
pub mod OverrideReturnsObject;
pub mod ParamShadowsBuiltins;
pub mod ParamShadowsScope;
pub mod PartiallyInitializedThisConsumer;
pub mod Polymorphism;
pub mod Power;
pub mod PropertyNamedProperty;
pub mod PublicClass;
pub mod PureMethods;
pub mod PythonReservedWords;
pub mod ReferenceEnumFromScopedPackage;
pub mod ReturnsPrivateImplementationOfInterface;
pub mod RootStruct;
pub mod RootStructValidator;
pub mod RuntimeTypeChecking;
pub mod SecondLevelStruct;
pub mod SingleInstanceTwoTypes;
pub mod SingletonInt;
pub mod SingletonIntEnum;
pub mod SingletonString;
pub mod SingletonStringEnum;
pub mod SmellyStruct;
pub mod SomeTypeJsii976;
pub mod StableClass;
pub mod StableEnum;
pub mod StableStruct;
pub mod StaticContext;
pub mod StaticHelloParent;
pub mod Statics;
pub mod StringEnum;
pub mod StripInternal;
pub mod StructPassing;
pub mod StructUnionConsumer;
pub mod StructWithEnum;
pub mod StructWithJavaReservedWords;
pub mod Sum;
pub mod SupportsNiceJavaBuilder;
pub mod SupportsNiceJavaBuilderProps;
pub mod SupportsNiceJavaBuilderWithRequiredProps;
pub mod SyncVirtualMethods;
pub mod TestStructWithEnum;
pub mod Thrower;
pub mod TopLevelStruct;
pub mod TwoMethodsWithSimilarCapitalization;
pub mod UmaskCheck;
pub mod UnaryOperation;
pub mod UnionProperties;
pub mod UpcasingReflectable;
pub mod UseBundledDependency;
pub mod UseCalcBase;
pub mod UsesInterfaceWithProperties;
pub mod VariadicInvoker;
pub mod VariadicMethod;
pub mod VariadicTypeUnion;
pub mod VirtualMethodPlayground;
pub mod VoidCallback;
pub mod WeirdDocs;
pub mod WithPrivatePropertyInConstructor;

// Namespace modules
pub mod NumericValue;
pub mod anonymous;
pub mod cdk16625;
pub mod cdk22369;
pub mod composition;
pub mod homonymousForwardReferences;
pub mod jsii3656;
pub mod module2530;
pub mod module2617;
pub mod module2647;
pub mod module2689;
pub mod module2692;
pub mod module2700;
pub mod module2702;
pub mod nodirect;
pub mod onlystatic;
pub mod submodule;
pub mod union;

// Re-export common types for convenience
pub use jsii_runtime::{
    BaseFor2647,
    BaseProps,
    IBaseInterface,
    IFriendly,
    IRandomNumberGenerator,
    IReflectable,
    JsiiConvert,
    JsiiObjectRef,
    JsiiRuntime,
    // External dependencies
    NumericValue,
    ReflectableEntry,
    Reflector,
};

export const TEST_ATTRIBUTE_REGEX =
    /\[\s*(?:NUnit\.Framework\.|Xunit\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?(Test|TestCase|TestCaseSource|Fact|Theory|TestMethod|DataTestMethod)\b/;

export const PARAMETERIZED_ATTRIBUTE_REGEX =
    /\[\s*(?:NUnit\.Framework\.|Xunit\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?(TestCase|InlineData|DataRow)\s*\(/;

export const CLASS_REGEX =
    /(?:public|internal)\s+(?:sealed\s+|abstract\s+|static\s+|partial\s+)*class\s+(\w+)/;

export const METHOD_REGEX =
    /(?:public|internal|protected)\s+(?:static\s+|async\s+|virtual\s+|override\s+)*\S+\s+(\w+)\s*(?:<[^>]+>\s*)?\(/;

export const DYNAMIC_SOURCE_ATTRIBUTE_REGEX =
    /\[\s*(?:NUnit\.Framework\.)?TestCaseSource\b/;

export const NAMESPACE_REGEX = /^\s*namespace\s+([\w.]+)/;

import { describe, expect, test } from "bun:test";
import { parseIRCFormatting, parseSlackMarkdown } from "./parser";

describe("parseSlackMarkdown", () => {
	test("converts channel mentions with name", () => {
		const result = parseSlackMarkdown("Check out <#C123ABC|general>");
		expect(result).toBe("Check out #general");
	});

	test("converts channel mentions without name", () => {
		const result = parseSlackMarkdown("Check out <#C123ABC>");
		expect(result).toBe("Check out #channel");
	});

	test("converts links with text", () => {
		const result = parseSlackMarkdown(
			"Visit <https://example.com|Example Site>",
		);
		expect(result).toBe("Visit Example Site (https://example.com)");
	});

	test("converts links without text", () => {
		const result = parseSlackMarkdown("Visit <https://example.com>");
		expect(result).toBe("Visit https://example.com");
	});

	test("converts mailto links", () => {
		const result = parseSlackMarkdown(
			"Email <mailto:test@example.com|Support>",
		);
		expect(result).toBe("Email Support <test@example.com>");
	});

	test("converts special mentions", () => {
		expect(parseSlackMarkdown("<!here> everyone")).toBe("@here everyone");
		expect(parseSlackMarkdown("<!channel> announcement")).toBe(
			"@channel announcement",
		);
		expect(parseSlackMarkdown("<!everyone> alert")).toBe("@everyone alert");
	});

	test("converts user group mentions", () => {
		const result = parseSlackMarkdown("Hey <!subteam^GROUP123|developers>");
		expect(result).toBe("Hey @developers");
	});

	test("converts bold formatting", () => {
		const result = parseSlackMarkdown("This is *bold* text");
		expect(result).toBe("This is \x02bold\x02 text");
	});

	test("converts italic formatting", () => {
		const result = parseSlackMarkdown("This is _italic_ text");
		expect(result).toBe("This is \x1Ditalic\x1D text");
	});

	test("strips strikethrough formatting", () => {
		const result = parseSlackMarkdown("This is ~strikethrough~ text");
		expect(result).toBe("This is strikethrough text");
	});

	test("strips code blocks", () => {
		const result = parseSlackMarkdown("Code: ```const x = 1;```");
		expect(result).toBe("Code: const x = 1;");
	});

	test("strips inline code", () => {
		const result = parseSlackMarkdown("Run `npm install` to start");
		expect(result).toBe("Run npm install to start");
	});

	test("unescapes HTML entities", () => {
		const result = parseSlackMarkdown("a &lt; b &amp;&amp; c &gt; d");
		expect(result).toBe("a < b && c > d");
	});

	test("handles mixed formatting", () => {
		const result = parseSlackMarkdown(
			"*Bold* and _italic_ with <https://example.com|link>",
		);
		expect(result).toBe(
			"\x02Bold\x02 and \x1Ditalic\x1D with link (https://example.com)",
		);
	});
});

describe("parseIRCFormatting", () => {
	test("strips IRC color codes", () => {
		const result = parseIRCFormatting("\x0304red text\x03 normal");
		expect(result).toBe("red text normal");
	});

	test("converts bold formatting", () => {
		const result = parseIRCFormatting("This is \x02bold\x02 text");
		expect(result).toBe("This is *bold* text");
	});

	test("converts italic formatting", () => {
		const result = parseIRCFormatting("This is \x1Ditalic\x1D text");
		expect(result).toBe("This is _italic_ text");
	});

	test("converts underline to italic", () => {
		const result = parseIRCFormatting("This is \x1Funderline\x1F text");
		expect(result).toBe("This is _underline_ text");
	});

	test("strips reverse/inverse formatting", () => {
		const result = parseIRCFormatting("Normal \x16reversed\x16 normal");
		expect(result).toBe("Normal reversed normal");
	});

	test("strips reset formatting", () => {
		const result = parseIRCFormatting("Text\x0F reset");
		expect(result).toBe("Text reset");
	});

	test("escapes special Slack characters", () => {
		const result = parseIRCFormatting("a < b & c > d");
		expect(result).toBe("a &lt; b &amp; c &gt; d");
	});

	test("handles mixed formatting", () => {
		const result = parseIRCFormatting("\x02Bold\x02 and \x1Ditalic\x1D");
		expect(result).toBe("*Bold* and _italic_");
	});

	test("handles nested formatting codes", () => {
		const result = parseIRCFormatting("\x02\x1Dbold italic\x1D\x02");
		expect(result).toBe("*_bold italic_*");
	});

	test("handles color codes with background", () => {
		const result = parseIRCFormatting("\x0304,08red on yellow\x03");
		expect(result).toBe("red on yellow");
	});
});

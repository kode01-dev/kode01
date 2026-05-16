import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import blog_pipeline as pipeline


class BlogPipelineTest(unittest.TestCase):
    def test_html_to_markdown_preserves_headings_links_and_lists(self):
        html = """
        <article>
          <h1>Main Title</h1>
          <p>Intro with <strong>bold</strong> and <a href="/blog/x">link</a>.</p>
          <h2>Section</h2>
          <ul><li>First item</li><li>Second item</li></ul>
        </article>
        """

        markdown = pipeline.html_to_markdown(html)

        self.assertIn("# Main Title", markdown)
        self.assertIn("## Section", markdown)
        self.assertIn("**bold**", markdown)
        self.assertIn("[link](/blog/x)", markdown)
        self.assertIn("- First item", markdown)

    def test_normalize_input_accepts_n8n_style_fields(self):
        profile = {"run_config": {"defaultLocale": "fr"}}
        normalized = pipeline._normalize_input(
            {
                "Keyword": "agent seo",
                "Article Title": "Agent SEO pour blogs",
                "Langue": "fr",
                "internal links": "/blog/a, /blog/b",
            },
            profile,
        )

        self.assertEqual(normalized["keyword"], "agent seo")
        self.assertEqual(normalized["title"], "Agent SEO pour blogs")
        self.assertEqual(normalized["locale"], "fr")
        self.assertEqual(normalized["internalLinks"], ["/blog/a", "/blog/b"])

    def test_quality_gate_fails_short_content(self):
        state = {
            "profile": {"nodes_config": {"quality_gate": {"minWords": 100}}},
            "article_html": "<article><h1>Title</h1><h2>Section</h2><p>Too short.</p></article>",
            "article_markdown": "# Title\n\n## Section\n\nToo short.\n" * 12,
            "node_statuses": {},
        }

        with self.assertRaises(pipeline.BlogPipelineError):
            pipeline.quality_gate_node(state)

        self.assertFalse(state["qa_report"]["passed"])
        self.assertEqual(state["node_statuses"]["quality_gate"]["status"], "failed")


if __name__ == "__main__":
    unittest.main()

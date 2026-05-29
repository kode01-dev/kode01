import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import recap_pipeline as pipeline
from recap_repository import RecapDayTheme, RecapSchedule, RecapScheduleSlot, RecapSource


class FakeNode:
    def __init__(self, text: str):
        self._text = text

    def get_all_text(self, strip: bool = True) -> str:
        return self._text.strip() if strip else self._text


class FakePage:
    status = 200
    html_content = "<html><body><article>fallback html</article></body></html>"

    def css(self, selector: str):
        if selector == "meta[property='og:title']::attr(content)":
            return ["Enterprise AI launch"]
        if selector == "article":
            return [FakeNode(("This article has enough words and 2026 data. " * 30).strip())]
        if selector == "a::attr(href)":
            return ["/news/enterprise-ai-launch"]
        return []

    def get_all_text(self, strip: bool = True) -> str:
        return ("Global fallback text with enough words. " * 30).strip()


class FakeLinkPage(FakePage):
    def __init__(self, link: str):
        self.link = link

    def css(self, selector: str):
        if selector == "a::attr(href)":
            return [self.link]
        return super().css(selector)


class FakeResponse:
    def __init__(self, payload, status_code=200, text=None):
        self._payload = payload
        self.status_code = status_code
        self.text = text if text is not None else "{}"

    def json(self):
        return self._payload


class FakeAnthropicClient:
    responses = []
    requests = []

    def __init__(self, timeout=300.0):
        self.timeout = timeout

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url, headers=None, json=None, params=None):
        self.__class__.requests.append({"url": url, "headers": headers or {}, "json": json or {}, "params": params or {}})
        if not self.__class__.responses:
            raise AssertionError("No fake Anthropic response configured")
        return self.__class__.responses.pop(0)


def make_source(**overrides):
    values = {
        "id": "src_1",
        "name": "Source",
        "url": "https://example.com/news",
        "feed_url": "https://example.com/feed.xml",
        "scrape_route": "rss",
        "rss_allow_firecrawl_fallback": True,
        "priority": 100,
        "is_active": True,
    }
    values.update(overrides)
    return RecapSource(**values)


def make_config(**overrides):
    values = {
        "timezone": "America/Toronto",
        "max_sources": 12,
        "target_successful_scrapes": 1,
        "scrape_min_words": 40,
        "evidence_snippet_max_chars": 1800,
        "evidence_claims_max_per_story": 8,
        "evidence_pack_max_chars": 12000,
        "google_api_key": "gemini-key",
        "summary_model": "gemini-test",
        "anthropic_api_key": "anthropic-key",
        "max_articles_per_run": 20,
        "article_model": "claude-test",
        "article_fallback_model": None,
        "article_max_tokens": 2000,
        "ai_fail_fast": True,
        "allow_paid_fallback": False,
        "max_anthropic_calls_per_run": 4,
        "firecrawl_api_key": "firecrawl-key",
        "app_base_url": "https://kode01.test",
        "sendfox_api_token": "sendfox-key",
        "sendfox_list_id": "123",
        "sendfox_test_list_id": "456",
        "sendfox_base_url": "https://sendfox.test",
        "sendfox_from_name": "KODE01",
        "sendfox_from_email": "news@kode01.test",
        "resend_api_key": None,
        "resend_from_email": "alerts@kode01.test",
        "alert_email_recipients": [],
        "alert_cooldown_minutes": 60,
    }
    values.update(overrides)
    return pipeline.NativeRecapConfig(**values)


def make_brief():
    return {
        "tags": ["AI & LLM", "Enterprise"],
        "fr": {
            "title": "Recap IA",
            "introduction": "Intro FR",
            "bigNews": {"name": "Launch", "impact": "Impact", "source_url": "https://example.com/story"},
            "quickHits": [],
            "lookingAhead": "Suite",
        },
        "en": {
            "title": "AI Recap",
            "introduction": "Intro EN",
            "bigNews": {"name": "Launch", "impact": "Impact", "source_url": "https://example.com/story"},
            "quickHits": [],
            "lookingAhead": "Next",
        },
    }


def make_article():
    return {
        "fr": {"title": "Titre FR", "introduction": "Intro FR", "article_markdown": "# FR\n\nContenu verifie."},
        "en": {"title": "Title EN", "introduction": "Intro EN", "article_markdown": "# EN\n\nVerified content."},
    }


def make_anthropic_payload(output, stop_reason="end_turn", usage=None):
    return {
        "stop_reason": stop_reason,
        "usage": usage or {"input_tokens": 10, "output_tokens": 20},
        "content": [{"type": "text", "text": output if isinstance(output, str) else json.dumps(output)}],
    }


def make_summary():
    return {
        "fr": {"bullets": ["FR 1"], "primary_source_url": "https://example.com/story", "source_urls": ["https://example.com/story"]},
        "en": {"bullets": ["EN 1"], "primary_source_url": "https://example.com/story", "source_urls": ["https://example.com/story"]},
    }


def make_copyright_compliance(max_risk="low", issues=None):
    issues = issues if issues is not None else []
    return {
        "status": "fail" if max_risk == "high" else "warn" if issues else "pass",
        "max_risk": max_risk,
        "issues": issues,
    }


class FakeRepo:
    def __init__(self):
        self.run = {"id": "run_1", "attempt": 1}
        self.edition = {"id": "edition_1", "edition_key": "AI-2026-W18", "status": "draft"}
        self.sources = [make_source(scrape_route="rss", url="https://example.com", feed_url="https://example.com/feed.xml")]
        self.documents = []
        self.posts = {}
        self.dispatch = None
        self.edition_updates = []
        self.run_marks = []
        self.artifacts = {}
        self.artifact_upserts = []
        self.published_source_urls_by_edition = {}
        self.notifications = []
        self.admin_profile_ids = ["admin_1"]

    def get_schedule(self, timezone_name):
        return RecapSchedule(is_enabled=True, timezone=timezone_name, slots=[RecapScheduleSlot(day=99, hour=0, minute=0)])

    def create_run(self, edition_key, trigger_type, mode):
        self.run = {"id": f"run_{len(self.run_marks) + 1}", "attempt": 1}
        return self.run

    def has_blocking_running_run(self, edition_key, mode, older_than_minutes=60):
        return False

    def ensure_edition(self, edition_key, run_id, week_start, week_end):
        self.edition = {**self.edition, "edition_key": edition_key}
        return self.edition

    def get_day_theme(self, day_index):
        return RecapDayTheme(day_index=day_index, theme_key="daily", source_ids=["src_1"], is_active=True, skip_if_quiet=False)

    def get_active_sources(self, max_sources=12, source_ids=None):
        return self.sources[:max_sources]

    def persist_document(self, run_id, source, scrape):
        self.documents.append(scrape)

    def upsert_posts(self, posts):
        for post in posts:
            self.posts[post["locale"]] = post
        return posts

    def update_edition(self, edition_id, fields):
        self.edition_updates.append(fields)
        self.edition.update(fields)

    def get_generation_artifact(self, edition_key, stage, input_hash):
        return self.artifacts.get((edition_key, stage, input_hash))

    def upsert_generation_artifact(self, fields):
        payload = dict(fields)
        self.artifact_upserts.append(payload)
        self.artifacts[(payload["edition_key"], payload["stage"], payload["input_hash"])] = payload

    def mark_run(self, run_id, status, metrics, error_message=None, failure_reason=None):
        self.run_marks.append(
            {
                "run_id": run_id,
                "status": status,
                "metrics": metrics,
                "error_message": error_message,
                "failure_reason": failure_reason,
            }
        )

    def get_posts_for_edition(self, edition_id):
        return self.posts

    def get_sent_dispatch(self, edition_id):
        return self.dispatch if self.dispatch and self.dispatch.get("status") == "sent" else None

    def upsert_dispatch(self, edition_id, fields):
        self.dispatch = {"edition_id": edition_id, **fields}

    def get_edition_by_key(self, edition_key):
        return self.edition if not edition_key or edition_key == self.edition.get("edition_key") else None

    def get_latest_published_edition(self):
        return self.edition if self.edition.get("status") == "published" else None

    def get_published_source_urls(self, exclude_edition_key=None):
        excluded = (exclude_edition_key or "").strip().upper()
        urls = []
        for edition_key, edition_urls in self.published_source_urls_by_edition.items():
            if str(edition_key).strip().upper() == excluded:
                continue
            urls.extend(edition_urls)
        return urls

    def get_admin_profile_ids(self, limit=50):
        return self.admin_profile_ids[:limit]

    def find_recent_ai_recap_alert(self, dedupe_key, since_iso):
        for notification in reversed(self.notifications):
            metadata = notification.get("metadata")
            if isinstance(metadata, dict) and metadata.get("dedupe_key") == dedupe_key:
                return notification
        return None

    def create_notification(self, fields):
        notification = {"id": f"notif_{len(self.notifications) + 1}", **fields}
        self.notifications.append(notification)
        return notification

    def update_notification(self, notification_id, fields):
        for notification in self.notifications:
            if notification.get("id") == notification_id:
                notification.update(fields)


class RecapPipelineScraplingTests(unittest.TestCase):
    def setUp(self):
        self.original_scrapling_fetch = pipeline._scrapling_fetch
        self.original_fetch_url_text = pipeline._fetch_url_text
        self.original_validate_public_https_url = pipeline._validate_public_https_url
        pipeline._validate_public_https_url = lambda url, base_url=None: pipeline.urljoin(base_url, url.strip()) if base_url else url.strip()
        self.original_firecrawl = pipeline._scrape_with_firecrawl
        self.original_scrape_source = pipeline._scrape_source
        self.original_generate_brief = pipeline._generate_brief
        self.original_generate_article = pipeline._generate_article
        self.original_fact_check = pipeline._fact_check
        self.original_copyright_compliance_check = pipeline._copyright_compliance_check
        self.original_rewrite_article_for_copyright_compliance = pipeline._rewrite_article_for_copyright_compliance
        self.original_generate_summary30 = pipeline._generate_summary30
        self.original_sendfox_request = pipeline._sendfox_request
        self.original_send_resend_alert_email = pipeline._send_resend_alert_email
        self.original_repository = pipeline.RecapRepository
        self.original_httpx_client = pipeline.httpx.Client

    def tearDown(self):
        pipeline._scrapling_fetch = self.original_scrapling_fetch
        pipeline._fetch_url_text = self.original_fetch_url_text
        pipeline._validate_public_https_url = self.original_validate_public_https_url
        pipeline._scrape_with_firecrawl = self.original_firecrawl
        pipeline._scrape_source = self.original_scrape_source
        pipeline._generate_brief = self.original_generate_brief
        pipeline._generate_article = self.original_generate_article
        pipeline._fact_check = self.original_fact_check
        pipeline._copyright_compliance_check = self.original_copyright_compliance_check
        pipeline._rewrite_article_for_copyright_compliance = self.original_rewrite_article_for_copyright_compliance
        pipeline._generate_summary30 = self.original_generate_summary30
        pipeline._sendfox_request = self.original_sendfox_request
        pipeline._send_resend_alert_email = self.original_send_resend_alert_email
        pipeline.RecapRepository = self.original_repository
        pipeline.httpx.Client = self.original_httpx_client

    def test_scrapling_extracts_article_content(self):
        pipeline._scrapling_fetch = lambda url, stealth=False: FakePage()
        config = make_config()

        result = pipeline._scrape_with_scrapling(make_source(), "https://example.com/news/enterprise-ai-launch", config)

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["scrape_method"], "scrapling")
        self.assertEqual(result["title"], "Enterprise AI launch")
        self.assertGreaterEqual(result["quality"]["word_count"], config.scrape_min_words)
        self.assertIn("duration_ms", result)

    def test_rss_uses_scrapling_for_entry_link(self):
        feed = """
        <rss><channel><item>
          <title>RSS Story</title>
          <link>https://example.com/news/rss-story</link>
          <description>Short teaser</description>
        </item></channel></rss>
        """
        pipeline._validate_public_https_url = lambda url: url
        pipeline._fetch_url_text = lambda url, timeout, user_agent=None: (200, feed)
        pipeline._scrapling_fetch = lambda url, stealth=False: FakePage()
        config = make_config()

        result = pipeline._scrape_via_rss(make_source(), config)

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["scrape_method"], "rss+scrapling")
        self.assertEqual(result["source_url"], "https://example.com/news/rss-story")

    def test_rss_skips_duplicate_first_entry_and_uses_next_entry(self):
        feed = """
        <rss><channel>
          <item>
            <title>Old RSS Story</title>
            <link>https://example.com/news/old-rss-story</link>
            <description>Old teaser</description>
          </item>
          <item>
            <title>New RSS Story</title>
            <link>https://example.com/news/new-rss-story</link>
            <description>New teaser</description>
          </item>
        </channel></rss>
        """
        calls = []
        pipeline._validate_public_https_url = lambda url: url
        pipeline._fetch_url_text = lambda url, timeout, user_agent=None: (200, feed)
        pipeline._scrapling_fetch = lambda url, stealth=False: calls.append(url) or FakePage()
        seen = pipeline._canonical_source_url_set(["https://example.com/news/old-rss-story"])

        result = pipeline._scrape_via_rss(make_source(), make_config(), seen)

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["source_url"], "https://example.com/news/new-rss-story")
        self.assertEqual(calls, ["https://example.com/news/new-rss-story"])

    def test_rss_atom_href_link_is_supported(self):
        feed = """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Atom Story</title>
            <link rel="alternate" href="https://example.com/news/atom-story" />
            <summary>Atom teaser</summary>
          </entry>
        </feed>
        """
        pipeline._validate_public_https_url = lambda url: url
        pipeline._fetch_url_text = lambda url, timeout, user_agent=None: (200, feed)
        pipeline._scrapling_fetch = lambda url, stealth=False: FakePage()

        result = pipeline._scrape_via_rss(make_source(), make_config())

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["source_url"], "https://example.com/news/atom-story")
        self.assertEqual(result["scrape_method"], "rss+scrapling")

    def test_rss_skips_blocked_entry_link_and_uses_next_entry(self):
        feed = """
        <rss><channel>
          <item>
            <title>Blocked</title>
            <link>https://127.0.0.1/private</link>
            <description>Blocked teaser</description>
          </item>
          <item>
            <title>Safe</title>
            <link>https://example.com/news/safe-story</link>
            <description>Safe teaser</description>
          </item>
        </channel></rss>
        """

        def validate(url):
            if "127.0.0.1" in url:
                raise RuntimeError("blocked_url:blocked_ip")
            return url

        pipeline._validate_public_https_url = validate
        pipeline._fetch_url_text = lambda url, timeout, user_agent=None: (200, feed)
        pipeline._scrapling_fetch = lambda url, stealth=False: FakePage()

        result = pipeline._scrape_via_rss(make_source(), make_config())

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["source_url"], "https://example.com/news/safe-story")

    def test_rss_rejects_blocked_feed_url(self):
        pipeline._validate_public_https_url = self.original_validate_public_https_url

        result = pipeline._scrape_via_rss(
            make_source(feed_url="https://127.0.0.1/feed.xml"),
            make_config(),
        )

        self.assertFalse(result["scrape_ok"])
        self.assertIn("blocked_url", result["error"])

    def test_rss_firecrawl_fallback_after_scrapling_failure_is_preserved(self):
        feed = """
        <rss><channel><item>
          <title>RSS Story</title>
          <link>https://example.com/news/rss-story</link>
          <description>Short teaser</description>
        </item></channel></rss>
        """
        pipeline._validate_public_https_url = lambda url: url
        pipeline._fetch_url_text = lambda url, timeout, user_agent=None: (200, feed)
        pipeline._scrapling_fetch = lambda url, stealth=False: (_ for _ in ()).throw(RuntimeError("blocked"))
        pipeline._scrape_with_firecrawl = lambda source, target_url, config: {
            "source_url": target_url,
            "title": "Fallback",
            "text": "fallback text",
            "snippet": "fallback text",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "firecrawl",
            "quality": {"word_count": 150, "data_points": 0, "score": 150},
        }

        result = pipeline._scrape_via_rss(make_source(), make_config())

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["scrape_method"], "rss+firecrawl")
        self.assertEqual(result["source_url"], "https://example.com/news/rss-story")

    def test_rss_fetch_blocks_redirect_to_private_destination(self):
        pipeline._validate_public_https_url = self.original_validate_public_https_url

        class RedirectResponse:
            status_code = 302
            headers = {"location": "https://127.0.0.1/private"}
            content = b""
            text = ""

        class RedirectClient:
            def __init__(self, timeout=10.0, follow_redirects=False):
                self.timeout = timeout
                self.follow_redirects = follow_redirects

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def get(self, url, headers=None):
                return RedirectResponse()

        pipeline.httpx.Client = RedirectClient

        with self.assertRaises(RuntimeError) as raised:
            pipeline._fetch_url_text("https://93.184.216.34/feed.xml", 10)

        self.assertIn("blocked_url", str(raised.exception))

    def test_rss_fetch_rejects_oversized_response(self):
        pipeline._validate_public_https_url = self.original_validate_public_https_url

        class LargeResponse:
            status_code = 200
            headers = {}
            content = b"x" * (pipeline.RSS_MAX_BYTES + 1)
            text = "too large"

        class LargeClient:
            def __init__(self, timeout=10.0, follow_redirects=False):
                self.timeout = timeout
                self.follow_redirects = follow_redirects

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def get(self, url, headers=None):
                return LargeResponse()

        pipeline.httpx.Client = LargeClient

        with self.assertRaises(RuntimeError) as raised:
            pipeline._fetch_url_text("https://93.184.216.34/feed.xml", 10)

        self.assertIn("too large", str(raised.exception))

    def test_firecrawl_fallback_after_scrapling_failure(self):
        pipeline._scrapling_fetch = lambda url, stealth=False: (_ for _ in ()).throw(RuntimeError("blocked"))
        pipeline._scrape_with_firecrawl = lambda source, target_url, config: {
            "source_url": target_url,
            "title": "Fallback",
            "text": "fallback text",
            "snippet": "fallback text",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "firecrawl",
            "quality": {"word_count": 150, "data_points": 0, "score": 150},
        }
        config = make_config()

        result = pipeline._scrape_source(make_source(scrape_route="firecrawl", url="https://example.com/news"), config)

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["scrape_method"], "scrapling+firecrawl")

    def test_duplicate_non_rss_source_skips_before_article_extraction_or_firecrawl(self):
        calls = []

        def fake_scrapling_fetch(url, stealth=False):
            calls.append((url, stealth))
            if url == "https://example.com/news":
                return FakeLinkPage("/news/already-used")
            raise AssertionError("duplicate target should not be extracted")

        pipeline._scrapling_fetch = fake_scrapling_fetch
        pipeline._scrape_with_firecrawl = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("firecrawl should not run for duplicates"))
        seen = pipeline._canonical_source_url_set(["https://example.com/news/already-used?utm_source=newsletter#section"])

        result = pipeline._scrape_source(
            make_source(scrape_route="firecrawl", url="https://example.com/news", feed_url=None),
            make_config(),
            seen,
        )

        self.assertFalse(result["scrape_ok"])
        self.assertTrue(result["is_duplicate"])
        self.assertEqual(result["skip_reason"], "source_url_already_published")
        self.assertEqual(calls, [("https://example.com/news", False)])

    def test_new_non_rss_source_uses_scrapling_without_firecrawl(self):
        calls = []

        def fake_scrapling_fetch(url, stealth=False):
            calls.append((url, stealth))
            if url == "https://example.com/news":
                return FakeLinkPage("/news/new-story")
            return FakePage()

        pipeline._scrapling_fetch = fake_scrapling_fetch
        pipeline._scrape_with_firecrawl = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("firecrawl should remain a fallback"))

        result = pipeline._scrape_source(
            make_source(scrape_route="firecrawl", url="https://example.com/news", feed_url=None),
            make_config(),
            set(),
        )

        self.assertTrue(result["scrape_ok"])
        self.assertEqual(result["scrape_method"], "scrapling")
        self.assertIn(("https://example.com/news/new-story", False), calls)

    def test_collect_documents_skips_duplicate_and_uses_next_source(self):
        repo = FakeRepo()
        sources = [
            make_source(id="src_old", name="Old", url="https://example.com/old", feed_url=None, scrape_route="firecrawl", priority=200),
            make_source(id="src_new", name="New", url="https://example.com/new", feed_url=None, scrape_route="firecrawl", priority=100),
        ]

        def fake_scrape_source(source, config, seen_source_urls=None):
            if source.id == "src_old":
                return pipeline._duplicate_scrape_result(source, "https://example.com/old")
            return {
                "source_url": "https://example.com/new",
                "title": "New story",
                "text": ("New reliable story 2026. " * 20).strip(),
                "snippet": "New reliable story 2026.",
                "status": 200,
                "scrape_ok": True,
                "scrape_method": "scrapling",
                "quality": {"word_count": 80, "data_points": 1, "score": 130},
            }

        pipeline._scrape_source = fake_scrape_source

        docs, failed_sources, breakdown = pipeline._collect_documents(
            repo,
            "run_1",
            sources,
            make_config(target_successful_scrapes=1),
            pipeline._canonical_source_url_set(["https://example.com/old/"]),
        )
        stories = pipeline._pick_stories(docs)

        self.assertEqual(failed_sources, 0)
        self.assertEqual(breakdown["source_url_already_published"], 1)
        self.assertEqual([story["source_url"] for story in stories], ["https://example.com/new"])
        self.assertEqual(len(repo.documents), 2)

    def test_retry_excludes_current_edition_urls_from_published_history(self):
        repo = FakeRepo()
        repo.published_source_urls_by_edition = {
            "AI-2026-W18": ["https://example.com/current"],
            "AI-2026-W17": ["https://example.com/old"],
        }

        self.assertEqual(repo.get_published_source_urls(exclude_edition_key="AI-2026-W18"), ["https://example.com/old"])

    def test_source_fact_cards_do_not_include_raw_titles(self):
        cards = pipeline._build_source_fact_cards(
            [
                {
                    "source_url": "https://huggingface.co/blog/community",
                    "source_name": "Hugging Face Blog",
                    "title": "LeRobot Humanoid: An Open, Low-Cost, 3D-Printed Humanoid for Robot Learning",
                    "snippet": "LeRobot Humanoid: An Open, Low-Cost, 3D-Printed Humanoid for Robot Learning",
                    "text": "LeRobot Humanoid: An Open, Low-Cost, 3D-Printed Humanoid for Robot Learning",
                }
            ]
        )

        serialized = json.dumps(cards)
        self.assertEqual(cards[0]["source_character"], "community_listing")
        self.assertNotIn("An Open, Low-Cost, 3D-Printed Humanoid for Robot Learning", serialized)
        self.assertIn("LeRobot", cards[0]["topic_terms"])

    def test_generate_article_uses_source_cards_not_raw_evidence(self):
        repo = FakeRepo()
        tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=3)
        FakeAnthropicClient.requests = []
        FakeAnthropicClient.responses = [FakeResponse(make_anthropic_payload(make_article()))]
        pipeline.httpx.Client = FakeAnthropicClient

        pipeline._generate_article(
            [
                {
                    "source_url": "https://example.com/story",
                    "source_name": "Source",
                    "title": "Exact Source Title That Must Not Be Sent",
                    "text": "COPY THIS SOURCE SENTENCE VERBATIM.",
                }
            ],
            make_brief(),
            {
                "source_cards": [
                    {
                        "source_url": "https://example.com/story",
                        "source_name": "Source",
                        "source_character": "reported_source",
                        "safe_angle": "Original high-level synthesis.",
                        "topic_terms": ["Synthesis"],
                        "writing_constraints": ["Do not reproduce source wording."],
                    }
                ],
                "stories": [{"text": "COPY THIS SOURCE SENTENCE VERBATIM."}],
            },
            "AI-2026-W18",
            make_config(),
            repo=repo,
            run_id="run_1",
            tracker=tracker,
        )

        user_payload = FakeAnthropicClient.requests[0]["json"]["messages"][0]["content"]
        self.assertNotIn("COPY THIS SOURCE SENTENCE VERBATIM", user_payload)
        self.assertNotIn("Exact Source Title That Must Not Be Sent", user_payload)
        self.assertIn("sourceCards", user_payload)
        self.assertIn("Omit figures from secondary reporting", user_payload)
        self.assertIn("Do not use generic governance phrases", user_payload)

    def test_copyright_rewrite_uses_source_cards_not_raw_evidence(self):
        repo = FakeRepo()
        tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=3)
        FakeAnthropicClient.requests = []
        FakeAnthropicClient.responses = [FakeResponse(make_anthropic_payload(make_article()))]
        pipeline.httpx.Client = FakeAnthropicClient

        pipeline._rewrite_article_for_copyright_compliance(
            make_article(),
            make_copyright_compliance("high", [{"risk": "high", "passage": "Copied", "source_url": "https://example.com/story"}]),
            {
                "source_urls": ["https://example.com/story"],
                "source_cards": [
                    {
                        "source_url": "https://example.com/story",
                        "source_name": "Source",
                        "source_character": "reported_source",
                        "safe_angle": "Original high-level synthesis.",
                        "topic_terms": ["Synthesis"],
                        "writing_constraints": ["Do not reproduce source wording."],
                    }
                ],
                "stories": [{"text": "COPY THIS SOURCE SENTENCE VERBATIM."}],
            },
            make_config(),
            edition_key="AI-2026-W18",
            run_id="run_1",
            repo=repo,
            tracker=tracker,
        )

        user_payload = FakeAnthropicClient.requests[0]["json"]["messages"][0]["content"]
        self.assertNotIn("COPY THIS SOURCE SENTENCE VERBATIM", user_payload)
        self.assertIn("sourceCards", user_payload)

    def test_copyright_safe_digest_uses_attributed_original_template(self):
        article = pipeline._build_copyright_safe_digest_article(
            [
                {
                    "source_url": "https://techcrunch.com/story",
                    "source_name": "TechCrunch",
                    "title": "Robinhood now lets your AI agents trade stocks",
                    "text": "The company said it is launching support for AI agentic trading.",
                }
            ],
            make_brief(),
            {
                "source_cards": [
                    {
                        "source_url": "https://techcrunch.com/story",
                        "source_name": "TechCrunch",
                        "source_character": "reported_source",
                        "safe_angle": "Source-backed AI update involving Robinhood and agentic trading.",
                        "topic_terms": ["Robinhood", "agentic", "trading"],
                        "writing_constraints": ["Do not reproduce source wording."],
                    }
                ]
            },
            "AI-2026-W18",
        )

        serialized = json.dumps(article)
        self.assertIn("Selon [TechCrunch](https://techcrunch.com/story)", serialized)
        self.assertIn("According to [TechCrunch](https://techcrunch.com/story)", serialized)
        self.assertNotIn("now lets your AI agents trade stocks", serialized)
        self.assertNotIn("launching support for AI agentic trading", serialized)

    def test_source_fact_terms_ignore_bare_dates_and_counts(self):
        terms = pipeline._source_fact_terms(
            {
                "title": "What Happens Next After The Decline",
                "source_name": "Gary Marcus Substack",
                "text": "May 29, 2026. Comments 60. This is an opinion essay about AI predictions.",
            }
        )

        self.assertNotIn("29", terms["figures"])
        self.assertNotIn("2026", terms["figures"])
        self.assertNotIn("60", terms["figures"])

    def test_source_fact_terms_filter_source_metadata_entities(self):
        terms = pipeline._source_fact_terms(
            {
                "title": "Scaling safe enterprise AI with OpenAI governance frameworks",
                "source_name": "Artificial Intelligence News",
                "text": "AI Business Strategy Scaling. Ryan Daws May 29, 2026. OpenAI published governance framework details.",
            }
        )

        self.assertIn("OpenAI", terms["entities"])
        self.assertNotIn("AI Business Strategy Scaling", terms["entities"])
        self.assertNotIn("Ryan Daws May", terms["entities"])

    def test_copyright_safe_digest_prefers_non_opinion_sources(self):
        article = pipeline._build_copyright_safe_digest_article(
            [],
            make_brief(),
            {
                "source_cards": [
                    {
                        "source_url": "https://garymarcus.substack.com/p/example",
                        "source_name": "Gary Marcus Substack",
                        "source_character": "opinion_or_analysis",
                        "safe_angle": "Opinion analysis about AI forecasts.",
                        "topic_terms": ["Marcus", "Substack", "decline"],
                        "fact_terms": {"entities": ["Marcus", "Substack"], "figures": ["29", "2026", "60"]},
                    },
                    {
                        "source_url": "https://openai.com/index/example",
                        "source_name": "OpenAI",
                        "source_character": "company_announcement",
                        "safe_angle": "Company announcement about enterprise AI adoption.",
                        "topic_terms": ["OpenAI", "enterprise", "AI"],
                        "fact_terms": {"entities": ["OpenAI", "Enterprise"], "figures": []},
                    },
                ]
            },
            "AI-2026-W18",
        )

        serialized = json.dumps(article)
        self.assertIn("openai.com/index/example", serialized)
        self.assertNotIn("garymarcus.substack.com", serialized)
        self.assertNotIn("29, 2026, 60", serialized)

    def test_copyright_safe_digest_omits_uncontextualized_secondary_figures(self):
        article = pipeline._build_copyright_safe_digest_article(
            [],
            make_brief(),
            {
                "source_cards": [
                    {
                        "source_url": "https://www.artificialintelligence-news.com/news/scaling-safe-enterprise-ai-openai-governance-frameworks/",
                        "source_name": "Artificial Intelligence News",
                        "source_character": "reported_source",
                        "safe_angle": "Reported source about enterprise AI governance.",
                        "topic_terms": ["Artificial", "Intelligence", "Scaling", "enterprise"],
                        "fact_terms": {"entities": ["Artificial", "Intelligence"], "figures": ["$1 billion"]},
                    }
                ]
            },
            "AI-2026-W18",
        )

        serialized = json.dumps(article)
        self.assertNotIn("$1 billion", serialized)
        self.assertNotIn("reported figures", serialized)
        self.assertNotIn("who controls the action", serialized)
        self.assertNotIn("comment elle est tracee", serialized)

    def test_copyright_safe_digest_omits_metadata_entities(self):
        article = pipeline._build_copyright_safe_digest_article(
            [],
            make_brief(),
            {
                "source_cards": [
                    {
                        "source_url": "https://www.artificialintelligence-news.com/news/scaling-safe-enterprise-ai-openai-governance-frameworks/",
                        "source_name": "Artificial Intelligence News",
                        "source_character": "reported_source",
                        "safe_angle": "Reported source about enterprise AI governance.",
                        "topic_terms": ["OpenAI", "enterprise", "governance"],
                        "fact_terms": {
                            "entities": ["Scaling", "OpenAI", "AI Business Strategy Scaling", "Ryan Daws May"],
                            "figures": [],
                        },
                    }
                ]
            },
            "AI-2026-W18",
        )

        serialized = json.dumps(article)
        self.assertNotIn("AI Business Strategy Scaling", serialized)
        self.assertNotIn("Ryan Daws May", serialized)
        self.assertNotIn("the story connects", serialized)
        self.assertNotIn("le dossier relie", serialized)

    def test_shadow_mode_is_non_mutating(self):
        result = pipeline.run_modal_native_recap({"mode": "build_article"}, shadow_mode=True)

        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["body"]["status"], "skipped")
        self.assertEqual(result["body"]["reason"], "shadow_mode_disabled_for_full_native_recap")

    def test_tick_outside_schedule_skips(self):
        repo = FakeRepo()

        class RepoFactory:
            @staticmethod
            def from_env():
                return repo

        pipeline.RecapRepository = RepoFactory

        result = pipeline.run_modal_native_recap({"mode": "tick"}, shadow_mode=False)

        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["body"]["status"], "skipped")
        self.assertEqual(result["body"]["reason"], "outside_scheduled_window")
        self.assertEqual(repo.posts, {})

    def test_build_article_publishes_fr_and_en(self):
        repo = FakeRepo()
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Enterprise AI story",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()
        pipeline._generate_article = lambda stories, brief, evidence_pack, edition_key, config, **kwargs: make_article()
        pipeline._fact_check = lambda article, evidence_pack, config, **kwargs: {"status": "pass", "issues": []}
        pipeline._copyright_compliance_check = lambda article, evidence_pack, config, **kwargs: make_copyright_compliance()
        pipeline._generate_summary30 = lambda article, stories, config, **kwargs: make_summary()

        result = pipeline._run_build_article(
            {"trigger": "manual", "editionKey": "AI-2026-W18"},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(set(repo.posts.keys()), {"fr", "en"})
        self.assertTrue(repo.posts["fr"]["is_published"])
        self.assertTrue(repo.posts["en"]["is_published"])
        self.assertEqual(result["newsletter"]["reason"], "manual_build_no_auto_dispatch")
        self.assertEqual(repo.edition["quality_report"]["copyright_compliance"]["max_risk"], "low")
        self.assertEqual(repo.run_marks[-1]["metrics"]["copyright_compliance_status"], "pass")
        self.assertEqual(repo.run_marks[-1]["status"], "succeeded")

    def test_copyright_compliance_medium_attribution_warning_publishes_and_sends_newsletter(self):
        repo = FakeRepo()
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Enterprise AI story",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()
        pipeline._generate_article = lambda stories, brief, evidence_pack, edition_key, config, **kwargs: make_article()
        pipeline._rewrite_article_for_copyright_compliance = lambda article, copyright_compliance, evidence_pack, config, **kwargs: article
        pipeline._fact_check = lambda article, evidence_pack, config, **kwargs: {"status": "pass", "issues": []}
        compliance = pipeline._normalize_copyright_compliance_report({
            "max_risk": "medium",
            "issues": [
                {
                    "risk": "medium",
                    "rule_ids": ["5", "6"],
                    "locale": "fr",
                    "passage": "Une statistique specifique est mentionnee sans attribution de proximite.",
                    "source_url": "https://example.com/story",
                    "reason": "Attribution insuffisante dans le paragraphe concerne.",
                    "suggestion": "Ajouter Selon [Source](https://example.com/story) dans le paragraphe.",
                    "requires_external_verification": False,
                }
            ],
        })
        pipeline._copyright_compliance_check = lambda article, evidence_pack, config, **kwargs: compliance
        pipeline._generate_summary30 = lambda *args, **kwargs: make_summary()
        pipeline._sendfox_request = lambda config, path, payload, method="POST": {"id": "campaign_medium"}

        result = pipeline._run_build_article(
            {"trigger": "cron", "editionKey": "AI-2026-W18", "force": True},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(set(repo.posts.keys()), {"fr", "en"})
        self.assertEqual(repo.dispatch["status"], "sent")
        self.assertEqual(result["newsletter"]["campaignId"], "campaign_medium")
        self.assertEqual(repo.edition["quality_report"]["copyright_compliance"]["max_risk"], "medium")
        self.assertEqual(repo.edition["quality_report"]["copyright_compliance"]["status"], "warn")
        self.assertEqual(repo.run_marks[-1]["metrics"]["copyright_compliance_status"], "warn")

    def test_copyright_compliance_medium_close_paraphrase_still_blocks_publication(self):
        repo = FakeRepo()
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Enterprise AI story",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()
        pipeline._generate_article = lambda stories, brief, evidence_pack, edition_key, config, **kwargs: make_article()
        pipeline._rewrite_article_for_copyright_compliance = lambda article, copyright_compliance, evidence_pack, config, **kwargs: article
        pipeline._fact_check = lambda article, evidence_pack, config, **kwargs: {"status": "pass", "issues": []}
        compliance = pipeline._normalize_copyright_compliance_report({
            "max_risk": "medium",
            "issues": [
                {
                    "risk": "medium",
                    "rule_ids": ["2"],
                    "locale": "en",
                    "passage": "A sentence follows the same source wording.",
                    "source_url": "https://example.com/story",
                    "reason": "The passage is a close paraphrase of source wording and preserves sentence structure.",
                    "suggestion": "Rewrite with a different structure.",
                    "requires_external_verification": False,
                }
            ],
        })
        pipeline._copyright_compliance_check = lambda article, evidence_pack, config, **kwargs: compliance
        pipeline._generate_summary30 = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("summary should not run"))
        pipeline._sendfox_request = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("newsletter should not send"))

        result = pipeline._run_build_article(
            {"trigger": "cron", "editionKey": "AI-2026-W18", "force": True},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "copyright_compliance_failed")
        self.assertEqual(repo.posts, {})
        self.assertIsNone(repo.dispatch)
        self.assertEqual(repo.edition["quality_report"]["copyright_compliance"]["max_risk"], "medium")
        self.assertEqual(repo.edition["quality_report"]["copyright_compliance"]["status"], "fail")
        self.assertEqual(repo.run_marks[-1]["failure_reason"], "copyright_compliance_failed")

    def test_copyright_compliance_medium_weak_attribution_does_not_block_policy(self):
        report = pipeline._normalize_copyright_compliance_report({
            "max_risk": "medium",
            "issues": [
                {
                    "risk": "medium",
                    "rule_ids": ["3"],
                    "locale": "en",
                    "passage": "The claim needs closer attribution.",
                    "source_url": "https://example.com/story",
                    "reason": "Attribution is present but not close enough to the paragraph.",
                    "suggestion": "Add proximity attribution.",
                    "requires_external_verification": False,
                }
            ],
        })

        self.assertEqual(report["status"], "warn")
        self.assertFalse(pipeline._copyright_compliance_should_block(report))

    def test_copyright_compliance_medium_copy_language_blocks_policy(self):
        report = pipeline._normalize_copyright_compliance_report({
            "max_risk": "medium",
            "issues": [
                {
                    "risk": "medium",
                    "rule_ids": ["2"],
                    "locale": "en",
                    "passage": "The article keeps the source structure.",
                    "source_url": "https://example.com/story",
                    "reason": "This is a close translation and paragraph-level paraphrase of source wording.",
                    "suggestion": "Rewrite independently.",
                    "requires_external_verification": False,
                }
            ],
        })

        self.assertEqual(report["status"], "fail")
        self.assertTrue(pipeline._copyright_compliance_should_block(report))

    def test_copyright_compliance_high_risk_uses_deterministic_digest_without_rewrite(self):
        repo = FakeRepo()
        compliance_reports = [
            make_copyright_compliance(
                "high",
                [
                    {
                        "risk": "high",
                        "rule_ids": ["1"],
                        "locale": "en",
                        "passage": "A copied source sentence appears verbatim.",
                        "source_url": "https://example.com/story",
                        "reason": "Too close to the source.",
                        "suggestion": "Rewrite with attribution.",
                        "requires_external_verification": False,
                    }
                ],
            ),
            make_copyright_compliance("low", []),
        ]
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Enterprise AI story",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()
        pipeline._generate_article = lambda stories, brief, evidence_pack, edition_key, config, **kwargs: make_article()
        pipeline._rewrite_article_for_copyright_compliance = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("rewrite should not run"))
        pipeline._fact_check = lambda article, evidence_pack, config, **kwargs: {"status": "pass", "issues": []}
        pipeline._copyright_compliance_check = lambda article, evidence_pack, config, **kwargs: compliance_reports.pop(0)
        pipeline._generate_summary30 = lambda *args, **kwargs: make_summary()

        result = pipeline._run_build_article(
            {"trigger": "manual", "editionKey": "AI-2026-W18"},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(repo.posts["en"]["title"], "Today's AI Signals That Matter")
        self.assertFalse(repo.edition["quality_report"]["copyright_rewrite"]["attempted"])
        self.assertEqual(repo.run_marks[-1]["metrics"]["copyright_rewrite_attempted"], False)
        self.assertTrue(repo.run_marks[-1]["metrics"]["copyright_safe_digest_attempted"])
        self.assertEqual(repo.run_marks[-1]["metrics"]["copyright_compliance_max_risk"], "low")

    def test_copyright_safe_digest_can_recover_from_high_risk_without_extra_generation(self):
        repo = FakeRepo()
        compliance_reports = [
            make_copyright_compliance(
                "high",
                [
                    {
                        "risk": "high",
                        "rule_ids": ["1"],
                        "locale": "en",
                        "passage": "A copied source sentence appears verbatim.",
                        "source_url": "https://example.com/story",
                        "reason": "Too close to the source.",
                        "suggestion": "Rewrite with attribution.",
                        "requires_external_verification": False,
                    }
                ],
            ),
            make_copyright_compliance("low", []),
        ]
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Exact Source Title That Must Not Be Published",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()
        pipeline._generate_article = lambda stories, brief, evidence_pack, edition_key, config, **kwargs: make_article()
        pipeline._rewrite_article_for_copyright_compliance = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("rewrite should not run"))
        pipeline._fact_check = lambda article, evidence_pack, config, **kwargs: {"status": "pass", "issues": []}
        pipeline._copyright_compliance_check = lambda article, evidence_pack, config, **kwargs: compliance_reports.pop(0)
        pipeline._generate_summary30 = lambda *args, **kwargs: make_summary()

        result = pipeline._run_build_article(
            {"trigger": "manual", "editionKey": "AI-2026-W18"},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertTrue(repo.edition["quality_report"]["copyright_safe_digest"]["attempted"])
        self.assertTrue(repo.run_marks[-1]["metrics"]["copyright_safe_digest_attempted"])
        self.assertEqual(repo.run_marks[-1]["metrics"]["copyright_compliance_max_risk"], "low")
        self.assertNotIn("Exact Source Title That Must Not Be Published", repo.posts["en"]["content_markdown"])

    def test_copyright_compliance_high_risk_blocks_copied_passage(self):
        repo = FakeRepo()
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Enterprise AI story",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()
        pipeline._generate_article = lambda stories, brief, evidence_pack, edition_key, config, **kwargs: make_article()
        pipeline._rewrite_article_for_copyright_compliance = lambda article, copyright_compliance, evidence_pack, config, **kwargs: article
        pipeline._fact_check = lambda article, evidence_pack, config, **kwargs: {"status": "pass", "issues": []}
        pipeline._copyright_compliance_check = lambda article, evidence_pack, config, **kwargs: make_copyright_compliance(
            "high",
            [
                {
                    "risk": "high",
                    "rule_ids": ["1", "2", "13"],
                    "locale": "en",
                    "passage": "A copied source sentence appears verbatim.",
                    "source_url": "https://example.com/story",
                    "reason": "The passage appears to copy or closely translate source wording.",
                    "suggestion": "Rewrite the claim with a different structure and attribution.",
                    "requires_external_verification": True,
                }
            ],
        )
        pipeline._generate_summary30 = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("summary should not run"))
        pipeline._sendfox_request = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("newsletter should not send"))

        result = pipeline._run_build_article(
            {"trigger": "manual", "editionKey": "AI-2026-W18"},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "copyright_compliance_failed")
        self.assertEqual(repo.posts, {})
        self.assertEqual(repo.edition["quality_report"]["copyright_compliance"]["max_risk"], "high")
        self.assertTrue(repo.edition["quality_report"]["copyright_compliance"]["issues"][0]["requires_external_verification"])

    def test_anthropic_request_uses_structured_output_config(self):
        repo = FakeRepo()
        tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=3)
        FakeAnthropicClient.requests = []
        FakeAnthropicClient.responses = [FakeResponse(make_anthropic_payload(make_article()))]
        pipeline.httpx.Client = FakeAnthropicClient

        result = pipeline._anthropic_json(
            make_config(),
            "system",
            '{"input":true}',
            output_schema=pipeline.ARTICLE_OUTPUT_SCHEMA,
            stage="article",
            edition_key="AI-2026-W18",
            run_id="run_1",
            repo=repo,
            tracker=tracker,
            input_payload={"input": True},
            max_output_tokens=1000,
        )

        self.assertEqual(result["en"]["title"], "Title EN")
        self.assertEqual(tracker.ai_calls, 1)
        request_body = FakeAnthropicClient.requests[0]["json"]
        self.assertEqual(request_body["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(request_body["output_config"]["format"]["schema"], pipeline.ARTICLE_OUTPUT_SCHEMA)
        self.assertEqual(repo.artifact_upserts[-1]["status"], "succeeded")

    def test_anthropic_max_tokens_fails_without_paid_retry(self):
        repo = FakeRepo()
        tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=3)
        FakeAnthropicClient.requests = []
        FakeAnthropicClient.responses = [FakeResponse(make_anthropic_payload(make_article(), stop_reason="max_tokens"))]
        pipeline.httpx.Client = FakeAnthropicClient

        with self.assertRaises(pipeline.RecapAiGenerationError) as raised:
            pipeline._anthropic_json(
                make_config(article_fallback_model="claude-fallback", allow_paid_fallback=True, ai_fail_fast=True),
                "system",
                '{"input":true}',
                output_schema=pipeline.ARTICLE_OUTPUT_SCHEMA,
                stage="article",
                edition_key="AI-2026-W18",
                run_id="run_1",
                repo=repo,
                tracker=tracker,
                input_payload={"input": True},
                max_output_tokens=1000,
            )

        self.assertEqual(raised.exception.reason, "anthropic_max_tokens")
        self.assertEqual(len(FakeAnthropicClient.requests), 1)
        self.assertEqual(repo.artifact_upserts[-1]["status"], "failed")

    def test_anthropic_malformed_json_is_not_repaired(self):
        tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=3)
        FakeAnthropicClient.requests = []
        FakeAnthropicClient.responses = [FakeResponse(make_anthropic_payload('{"issues": [],}'))]
        pipeline.httpx.Client = FakeAnthropicClient

        with self.assertRaises(pipeline.RecapAiGenerationError) as raised:
            pipeline._anthropic_json(
                make_config(),
                "system",
                '{"input":true}',
                output_schema=pipeline.FACT_CHECK_OUTPUT_SCHEMA,
                stage="fact_check",
                tracker=tracker,
                input_payload={"input": True},
                max_output_tokens=1000,
            )

        self.assertEqual(raised.exception.reason, "anthropic_invalid_json")
        self.assertEqual(len(FakeAnthropicClient.requests), 1)

    def test_generation_artifact_reuse_skips_anthropic_call(self):
        repo = FakeRepo()
        FakeAnthropicClient.requests = []
        FakeAnthropicClient.responses = [FakeResponse(make_anthropic_payload(make_article()))]
        pipeline.httpx.Client = FakeAnthropicClient

        first_tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=3)
        kwargs = {
            "config": make_config(),
            "system": "system",
            "user": '{"input":true}',
            "output_schema": pipeline.ARTICLE_OUTPUT_SCHEMA,
            "stage": "article",
            "edition_key": "AI-2026-W18",
            "run_id": "run_1",
            "repo": repo,
            "input_payload": {"input": True},
            "max_output_tokens": 1000,
        }
        pipeline._anthropic_json(tracker=first_tracker, **kwargs)

        second_tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=3)
        FakeAnthropicClient.responses = []
        result = pipeline._anthropic_json(tracker=second_tracker, **kwargs)

        self.assertEqual(result["fr"]["title"], "Titre FR")
        self.assertEqual(len(FakeAnthropicClient.requests), 1)
        self.assertEqual(second_tracker.ai_calls, 0)
        self.assertEqual(second_tracker.artifact_reused, 1)

    def test_anthropic_budget_blocks_before_api_call(self):
        tracker = pipeline.RecapAiRunTracker(max_anthropic_calls=0)
        FakeAnthropicClient.requests = []
        FakeAnthropicClient.responses = [FakeResponse(make_anthropic_payload(make_article()))]
        pipeline.httpx.Client = FakeAnthropicClient

        with self.assertRaises(pipeline.RecapAiGenerationError) as raised:
            pipeline._anthropic_json(
                make_config(),
                "system",
                '{"input":true}',
                output_schema=pipeline.ARTICLE_OUTPUT_SCHEMA,
                stage="article",
                tracker=tracker,
                input_payload={"input": True},
                max_output_tokens=1000,
            )

        self.assertEqual(raised.exception.reason, "anthropic_budget_exceeded")
        self.assertEqual(FakeAnthropicClient.requests, [])

    def test_fact_check_failure_blocks_publication(self):
        repo = FakeRepo()
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Enterprise AI story",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()
        pipeline._generate_article = lambda stories, brief, evidence_pack, edition_key, config, **kwargs: make_article()
        pipeline._fact_check = lambda article, evidence_pack, config, **kwargs: {
            "status": "fail",
            "issues": [{"severity": "major", "claim": "bad claim"}],
        }

        result = pipeline._run_build_article(
            {"trigger": "manual", "editionKey": "AI-2026-W18"},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "fact_check_failed")
        self.assertEqual(repo.posts, {})
        self.assertEqual(repo.run_marks[-1]["status"], "failed")

    def test_article_generation_failure_blocks_publication_and_newsletter(self):
        repo = FakeRepo()
        pipeline._scrape_source = lambda source, config, seen_source_urls=None: {
            "source_url": "https://example.com/story",
            "title": "Enterprise AI story",
            "text": ("Verified enterprise AI source text 2026. " * 20).strip(),
            "snippet": "Verified enterprise AI source text 2026.",
            "status": 200,
            "scrape_ok": True,
            "scrape_method": "rss+scrapling",
            "quality": {"word_count": 120, "data_points": 1, "score": 140},
        }
        pipeline._generate_brief = lambda stories, evidence_pack, edition_key, config: make_brief()

        def fail_article(*args, **kwargs):
            raise pipeline.RecapAiGenerationError(
                "anthropic_invalid_json",
                "malformed structured output",
                stage="article",
                model="claude-test",
            )

        pipeline._generate_article = fail_article
        pipeline._sendfox_request = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("newsletter should not send"))

        result = pipeline._run_build_article(
            {"trigger": "cron", "editionKey": "AI-2026-W18", "force": True},
            repo=repo,
            config=make_config(),
            schedule_timezone="America/Toronto",
        )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "anthropic_invalid_json")
        self.assertEqual(repo.posts, {})
        self.assertIsNone(repo.dispatch)
        self.assertEqual(repo.run_marks[-1]["failure_reason"], "anthropic_invalid_json")

    def test_newsletter_is_not_sent_twice(self):
        repo = FakeRepo()
        repo.posts = {
            "fr": {"slug": "recap-ia-ai-2026-w18", "title": "FR", "intro": "Intro FR", "excerpt": "FR excerpt"},
            "en": {"slug": "ai-weekly-recap-ai-2026-w18", "title": "EN", "intro": "Intro EN", "excerpt": "EN excerpt"},
        }
        repo.dispatch = {"status": "sent", "sendfox_campaign_id": "campaign_1"}
        calls = []
        pipeline._sendfox_request = lambda config, path, payload, method="POST": calls.append(payload) or {"id": "campaign_2"}

        result = pipeline._send_newsletter_for_edition(repo, make_config(), "edition_1", "AI-2026-W18")

        self.assertTrue(result["skipped"])
        self.assertEqual(result["reason"], "newsletter_already_sent")
        self.assertEqual(calls, [])

    def test_retry_newsletter_sends_campaign(self):
        repo = FakeRepo()
        repo.edition = {**repo.edition, "status": "published"}
        repo.posts = {
            "fr": {"slug": "recap-ia-ai-2026-w18", "title": "FR", "intro": "Intro FR", "excerpt": "FR excerpt"},
            "en": {"slug": "ai-weekly-recap-ai-2026-w18", "title": "EN", "intro": "Intro EN", "excerpt": "EN excerpt"},
        }
        pipeline._sendfox_request = lambda config, path, payload, method="POST": {"id": "campaign_3"}

        result = pipeline._run_retry_newsletter(
            {"editionKey": "AI-2026-W18"},
            repo=repo,
            config=make_config(),
        )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["newsletter"]["campaignId"], "campaign_3")
        self.assertEqual(repo.dispatch["status"], "sent")


if __name__ == "__main__":
    unittest.main()

from types import ModuleType

from django.test import SimpleTestCase, override_settings
from django.urls import include, path

from tracker.ui.views import constants


class TestUIConstants(SimpleTestCase):
    def test_public_root_follows_url_mount(self):
        for prefix in ('', 'tracker/', 'marathon/tracker/'):
            with self.subTest(prefix=prefix):
                urlconf = ModuleType('test_public_root_urls')
                urlconf.urlpatterns = [path(prefix, include('tracker.urls'))]
                with override_settings(ROOT_URLCONF=urlconf):
                    self.assertEqual(constants()['PUBLIC_ROOT'], '/' + prefix)

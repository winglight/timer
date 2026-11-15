#!/usr/bin/env python3
"""Compile and render every production scene through the vendored Three.js.

Install tests/requirements-webgl.txt and run `python -m playwright install chromium`
first. Software WebGL is deliberate: no physical GPU is required in CI. This is
not a Safari/iOS device certification or a photorealism/visual-quality review.
"""
from __future__ import annotations
import argparse
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenes', nargs='+')
    parser.add_argument('--expect-compile-failure', action='store_true')
    parser.add_argument('--out', default='.webgl-results/current')
    args = parser.parse_args()
    output = ROOT / args.out
    output.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    report = {'expectedFailure': args.expect_compile_failure, 'controls': [], 'cases': [], 'errors': []}
    try:
        with sync_playwright() as playwright:
            launch = {'headless': True, 'args': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']}
            if os.environ.get('CHROMIUM_PATH'):
                launch['executable_path'] = os.environ['CHROMIUM_PATH']
            browser = playwright.chromium.launch(**launch)
            report['browserVersion'] = browser.version
            viewports = [(1280, 720)] if args.expect_compile_failure else [(1280, 720), (390, 844)]
            try:
                for width, height in viewports:
                    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1, reduced_motion='no-preference')
                    page = context.new_page()
                    messages, exceptions = [], []
                    page.on('console', lambda message: messages.append({'type': message.type, 'text': message.text}))
                    page.on('pageerror', lambda error: exceptions.append(str(error)))
                    page.on('response', lambda response: messages.append({'type':'error', 'text':f'HTTP {response.status}: {response.url}'}) if response.status >= 400 else None)
                    try:
                        page.goto(f'http://127.0.0.1:{server.server_port}/tests/webgl-smoke.html', wait_until='load')
                        page.wait_for_function('window.ambientReady === true', timeout=60000)
                        report['runtimeUrl'] = page.evaluate('window.ambientRuntimeUrl')
                        if not args.expect_compile_failure and not report['controls']:
                            report['controls'] = page.evaluate('window.runInvalidShaderControls()')
                        ids = args.scenes or page.evaluate('window.ambientSceneIds')
                        for scene_id in ids:
                            start = len(messages)
                            result = page.evaluate('(id) => window.runAmbientCase(id)', scene_id)
                            result['viewport'] = [width, height]
                            result['console'] = messages[start:]
                            report['cases'].append(result)
                            print(json.dumps(result, ensure_ascii=False), flush=True)
                            console_text = '\n'.join(item['text'] for item in result['console'])
                            if args.expect_compile_failure:
                                if result.get('ok') or 'luminance' not in console_text:
                                    raise AssertionError('Expected the original luminance compiler failure in ' + scene_id)
                                if scene_id == 'desert' and 'active' not in console_text:
                                    raise AssertionError('Expected the original reserved active compiler failure')
                            else:
                                if not result.get('ok'):
                                    raise AssertionError('Missing, failed or static WebGL output: ' + scene_id)
                                if any(item['type'] in ('error', 'warning') for item in result['console']):
                                    raise AssertionError('Console failure while rendering ' + scene_id + ': ' + console_text)
                                data_url = page.evaluate('window.ambientLastFramePng')
                                (output / f'{scene_id}-{width}x{height}.png').write_bytes(base64.b64decode(data_url.split(',', 1)[1]))
                        if exceptions:
                            raise AssertionError('Uncaught browser errors: ' + '\n'.join(exceptions))
                    finally:
                        context.close()
            finally:
                browser.close()
    except Exception as error:
        report['errors'].append(str(error))
        raise
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"PASS: {len(report['cases'])} rendering cases, {len(report['controls'])} invalid-shader controls", flush=True)

if __name__ == '__main__':
    main()

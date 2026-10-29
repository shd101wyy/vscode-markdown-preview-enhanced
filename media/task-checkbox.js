// Clicks on preview checkboxes, including several on one table row.
// The preview bundle calls acquireVsCodeApi once; cache that call so this
// script and the bundle share it.
(function () {
  'use strict';

  var root = window;
  var acquire = root.acquireVsCodeApi;
  var api = null;
  if (typeof acquire === 'function') {
    root.acquireVsCodeApi = function () {
      if (!api) {
        api = acquire();
      }
      return api;
    };
    api = root.acquireVsCodeApi();
  }

  var sourceUri = '';
  var wiki = false;
  try {
    var el = document.getElementById('crossnote-data');
    var cfg = JSON.parse((el && el.getAttribute('data-config')) || '{}');
    wiki = !!cfg.isWiki;
    sourceUri = cfg.sourceUri || '';
  } catch (e) {
    wiki = false;
  }
  if (wiki) {
    return;
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (
      data &&
      data.command === 'updateHtml' &&
      typeof data.sourceUri === 'string'
    ) {
      sourceUri = data.sourceUri;
    }
  });

  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      if (!target || target.tagName !== 'INPUT') {
        return;
      }
      if (
        !target.classList ||
        !target.classList.contains('task-list-item-checkbox')
      ) {
        return;
      }
      var offsetAttr = target.getAttribute('data-checkbox-offset');
      var lineAttr = target.getAttribute('data-source-line');
      if (offsetAttr === null || lineAttr === null) {
        return;
      }
      var line = parseInt(lineAttr, 10);
      var offset = parseInt(offsetAttr, 10);
      if (isNaN(line) || isNaN(offset)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      var state = target.getAttribute('data-task-state');
      var checking = state !== 'x' && state !== 'X';
      target.checked = checking;
      target.setAttribute('data-task-state', checking ? 'x' : 'blank');
      if (checking) {
        target.setAttribute('checked', '');
      } else {
        target.removeAttribute('checked');
      }

      if (!api || !sourceUri) {
        return;
      }
      api.postMessage({
        command: 'clickTaskListCheckbox',
        args: [sourceUri, line - 1, offset],
      });
    },
    true,
  );
})();

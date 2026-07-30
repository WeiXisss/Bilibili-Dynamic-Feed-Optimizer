// ==UserScript==
// @name         哔哩哔哩动态页布局优化
// @name:en      Bilibili Dynamic Feed Layout Optimizer
// @namespace    http://tampermonkey.net/
// @version      0.5.7
// @description  优化哔哩哔哩动态页双列布局，支持调节动态宽度与列间距、隐藏已点赞视频，并将直播信息横向展示
// @author       WeiXi & Codex
// @match        https://t.bilibili.com/*
// @icon         https://www.google.com/s2/favicons?domain=bilibili.com
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const HIDDEN_CLASS = 'tuntun-bilibili-liked-hidden';
    const CARD_SELECTOR = '.bili-dyn-list__item';
    const VIDEO_TAB_SELECTOR = '.bili-dyn-list-tabs__item';
    const LIKE_SELECTOR = '.bili-dyn-action.like, [data-module="action"][data-type="like"]';
    const WIDTH_STORAGE_KEY = 'tuntun-bilibili-card-width';
    const GAP_STORAGE_KEY = 'tuntun-bilibili-column-gap';
    const HIDE_LIKED_STORAGE_KEY = 'tuntun-bilibili-hide-liked';
    const MIN_CARD_WIDTH = 520;
    const MAX_CARD_WIDTH = 760;
    const DEFAULT_CARD_WIDTH = 632;
    const MIN_COLUMN_GAP = 0;
    const MAX_COLUMN_GAP = 80;
    const DEFAULT_COLUMN_GAP = 8;
    const SIDEBAR_GAP = 12;
    const MIN_SIDEBAR_WIDTH = 180;
    let preferredCardWidth = DEFAULT_CARD_WIDTH;
    let preferredColumnGap = DEFAULT_COLUMN_GAP;
    let hideLikedEnabled = true;
    let layoutControls = null;
    let liveRow = null;

    const styleStr = `
        :root {
            --tuntun-card-width: 632px;
            --tuntun-main-width: 1272px;
            --tuntun-left-width: 204px;
            --tuntun-column-gap: 8px;
        }
        .bili-dyn-home--member {
            display: block !important;
            position: relative !important;
            width: var(--tuntun-main-width) !important;
            margin-left: auto !important;
            margin-right: auto !important;
        }
        .bili-dyn-home--member > main {
            width: var(--tuntun-main-width) !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
        }
        .bili-dyn-home--member > aside.left {
            position: absolute !important;
            top: 0 !important;
            right: calc(100% + ${SIDEBAR_GAP}px) !important;
            left: auto !important;
            width: var(--tuntun-left-width) !important;
            margin: 0 !important;
        }
        .bili-dyn-home--member > aside.left > * {
            width: 100% !important;
            box-sizing: border-box !important;
        }
        .bili-dyn-home--member > aside.left .bili-dyn-live-users,
        .bili-dyn-home--member > aside.left .bili-dyn-live-users__body,
        .bili-dyn-home--member > aside.left .bili-dyn-live-users__container,
        .bili-dyn-home--member > aside.left .bili-dyn-live-users__item-container {
            width: 100% !important;
            box-sizing: border-box !important;
        }
        .bili-dyn-home--member > aside.left .bili-dyn-live-users__item {
            width: calc(100% - 32px) !important;
        }
        .bili-dyn-home--member > aside.left .bili-dyn-live-users__item__right {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
        }
        html.tuntun-bilibili-hide-left .bili-dyn-home--member > aside.left,
        .bili-dyn-home--member > aside.right {
            display: none !important;
        }
        .most-viewed-panel {
            margin-bottom: 8px !important;
        }
        .bili-dyn-list__items {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            column-gap: var(--tuntun-column-gap) !important;
            row-gap: 0 !important;
            width: 100% !important;
        }
        .bili-dyn-list__item {
            flex: 0 0 var(--tuntun-card-width) !important;
            width: var(--tuntun-card-width) !important;
        }
        .bili-dyn-list__item .bili-dyn-item {
            box-sizing: border-box !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: 100% !important;
        }
        .bili-dyn-list__notification {
            margin-top: 8px !important;
            flex-basis: 100% !important;
        }
        .bili-dyn-list__item.${HIDDEN_CLASS} {
            display: none !important;
        }
        .bili-dyn-list-tabs__list {
            align-items: center !important;
        }
        #tuntun-bilibili-layout-controls {
            display: flex;
            align-items: center;
            gap: 18px;
            margin-left: 20px;
            color: #61666d;
            font-size: 13px;
            white-space: nowrap;
        }
        #tuntun-bilibili-layout-controls label {
            display: flex;
            align-items: center;
            gap: 7px;
        }
        #tuntun-bilibili-layout-controls input[type="range"] {
            width: 110px;
            margin: 0;
            accent-color: #00aeec;
            cursor: pointer;
            touch-action: none;
        }
        #tuntun-bilibili-layout-controls output {
            min-width: 38px;
            color: #00aeec;
            font-variant-numeric: tabular-nums;
        }
        #tuntun-bilibili-hide-liked-control {
            cursor: pointer;
        }
        #tuntun-bilibili-hide-liked-toggle {
            appearance: none;
            position: relative;
            width: 34px;
            height: 18px;
            margin: 0;
            border-radius: 9px;
            background: #c9ccd0;
            cursor: pointer;
            transition: background-color .2s ease;
        }
        #tuntun-bilibili-hide-liked-toggle::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0, 0, 0, .2);
            transition: transform .2s ease;
        }
        #tuntun-bilibili-hide-liked-toggle:checked {
            background: #00aeec;
        }
        #tuntun-bilibili-hide-liked-toggle:checked::after {
            transform: translateX(16px);
        }
        #tuntun-bilibili-live-row {
            width: 100%;
            margin-bottom: 8px;
        }
        #tuntun-bilibili-live-row .bili-dyn-live-users {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            position: relative !important;
            top: auto !important;
            width: 100% !important;
            min-height: 96px !important;
            padding: 12px 16px !important;
            box-sizing: border-box !important;
            border-radius: 6px !important;
        }
        #tuntun-bilibili-live-row .bili-dyn-live-users__header {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: center !important;
            gap: 6px !important;
            flex: 0 0 auto !important;
            width: auto !important;
            height: auto !important;
            margin-right: 20px !important;
        }
        #tuntun-bilibili-live-row .bili-dyn-live-users__more {
            margin: 0 !important;
        }
        #tuntun-bilibili-live-row .bili-dyn-live-users__body {
            display: flex !important;
            flex-flow: row nowrap !important;
            align-items: center !important;
            gap: 24px !important;
            flex: 1 1 auto !important;
            width: 0 !important;
            height: 72px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
        }
        #tuntun-bilibili-live-row .bili-dyn-live-users__container,
        #tuntun-bilibili-live-row .bili-dyn-live-users__item-container {
            flex: 0 0 auto !important;
            width: auto !important;
            min-width: 0 !important;
            height: 72px !important;
        }
        #tuntun-bilibili-live-row .bili-dyn-live-users__item {
            align-items: center !important;
            width: 232px !important;
            min-width: 232px !important;
            height: 72px !important;
        }
        #tuntun-bilibili-live-row .bili-dyn-live-users__item__right {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
        }
    `;

    function addStyles() {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(styleStr);
            return;
        }

        const styleDom = document.createElement('style');
        styleDom.id = 'tuntun-bilibili-index';
        styleDom.textContent = styleStr;
        document.head.appendChild(styleDom);
    }

    function readStoredNumber(key, fallback) {
        if (typeof GM_getValue !== 'function') return fallback;
        const storedValue = Number(GM_getValue(key, fallback));
        return Number.isFinite(storedValue) ? storedValue : fallback;
    }

    function readStoredBoolean(key, fallback) {
        if (typeof GM_getValue !== 'function') return fallback;
        return Boolean(GM_getValue(key, fallback));
    }

    function getMaximumWidthForViewport() {
        const available = Math.floor((window.innerWidth - 24 - MAX_COLUMN_GAP) / 2);
        return Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, available));
    }

    function applyLayout(width, gap, persistWidth = false, persistGap = false) {
        const columnGap = Math.max(MIN_COLUMN_GAP, Math.min(MAX_COLUMN_GAP, Number(gap) || 0));
        const maximumWidth = getMaximumWidthForViewport();
        const cardWidth = Math.max(MIN_CARD_WIDTH, Math.min(maximumWidth, Number(width) || DEFAULT_CARD_WIDTH));
        const mainWidth = cardWidth * 2 + columnGap;
        const availableSidebarWidth = Math.floor((window.innerWidth - mainWidth) / 2 - SIDEBAR_GAP);
        const sidebarWidth = Math.max(0, Math.min(264, availableSidebarWidth));
        const rootStyle = document.documentElement.style;

        rootStyle.setProperty('--tuntun-card-width', `${cardWidth}px`);
        rootStyle.setProperty('--tuntun-main-width', `${mainWidth}px`);
        rootStyle.setProperty('--tuntun-left-width', `${sidebarWidth}px`);
        rootStyle.setProperty('--tuntun-column-gap', `${columnGap}px`);
        document.documentElement.classList.toggle('tuntun-bilibili-hide-left', sidebarWidth < MIN_SIDEBAR_WIDTH);
        preferredCardWidth = cardWidth;
        preferredColumnGap = columnGap;

        if (layoutControls) {
            const widthSlider = layoutControls.querySelector('#tuntun-bilibili-width-slider');
            widthSlider.max = String(maximumWidth);
            widthSlider.value = String(cardWidth);
            layoutControls.querySelector('#tuntun-bilibili-width-value').textContent = `${cardWidth}px`;
            layoutControls.querySelector('#tuntun-bilibili-gap-slider').value = String(columnGap);
            layoutControls.querySelector('#tuntun-bilibili-gap-value').textContent = `${columnGap}px`;
        }

        if (persistWidth) {
            if (typeof GM_setValue === 'function') GM_setValue(WIDTH_STORAGE_KEY, cardWidth);
        }
        if (persistGap) {
            if (typeof GM_setValue === 'function') GM_setValue(GAP_STORAGE_KEY, columnGap);
        }
    }

    function enableStableSliderDrag(slider, onPreview, onCommit) {
        let dragState = null;

        slider.addEventListener('pointerdown', (event) => {
            if (event.pointerType !== 'touch' && event.button !== 0) return;
            event.preventDefault();
            slider.focus();

            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startValue: Number(slider.value),
                min: Number(slider.min),
                max: Number(slider.max),
                step: Number(slider.step) || 1,
                trackWidth: Math.max(1, slider.getBoundingClientRect().width)
            };

            try {
                slider.setPointerCapture(event.pointerId);
            } catch (_) {
                // Synthetic events used by tests do not own a real pointer.
            }
        });

        slider.addEventListener('pointermove', (event) => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            event.preventDefault();

            const delta = (event.clientX - dragState.startX) / dragState.trackWidth;
            const rawValue = dragState.startValue + delta * (dragState.max - dragState.min);
            const steppedValue = dragState.min + Math.round((rawValue - dragState.min) / dragState.step) * dragState.step;
            const nextValue = Math.max(dragState.min, Math.min(dragState.max, steppedValue));

            slider.value = String(nextValue);
            onPreview(nextValue);
        });

        const finishDrag = (event) => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            event.preventDefault();
            dragState = null;
            onCommit(Number(slider.value));
        };

        slider.addEventListener('pointerup', finishDrag);
        slider.addEventListener('pointercancel', finishDrag);
    }

    function ensureLayoutControls() {
        if (layoutControls?.isConnected) return;
        const tabList = document.querySelector('.bili-dyn-list-tabs__list');
        if (!tabList) return;

        layoutControls = document.createElement('div');
        layoutControls.id = 'tuntun-bilibili-layout-controls';
        layoutControls.innerHTML = `
            <label>
                <span>动态宽度</span>
                <input id="tuntun-bilibili-width-slider" type="range" min="${MIN_CARD_WIDTH}" max="${MAX_CARD_WIDTH}" step="4" aria-label="动态宽度">
                <output id="tuntun-bilibili-width-value"></output>
            </label>
            <label>
                <span>列间距</span>
                <input id="tuntun-bilibili-gap-slider" type="range" min="${MIN_COLUMN_GAP}" max="${MAX_COLUMN_GAP}" step="2" aria-label="列间距">
                <output id="tuntun-bilibili-gap-value"></output>
            </label>
            <label id="tuntun-bilibili-hide-liked-control">
                <input id="tuntun-bilibili-hide-liked-toggle" type="checkbox" role="switch" aria-label="隐藏已点赞视频">
                <span>隐藏已点赞视频</span>
            </label>
        `;
        const widthSlider = layoutControls.querySelector('#tuntun-bilibili-width-slider');
        const gapSlider = layoutControls.querySelector('#tuntun-bilibili-gap-slider');
        const hideLikedToggle = layoutControls.querySelector('#tuntun-bilibili-hide-liked-toggle');
        hideLikedToggle.checked = hideLikedEnabled;
        widthSlider.addEventListener('input', () => applyLayout(widthSlider.value, gapSlider.value));
        widthSlider.addEventListener('change', () => applyLayout(widthSlider.value, gapSlider.value, true, false));
        gapSlider.addEventListener('input', () => applyLayout(widthSlider.value, gapSlider.value));
        gapSlider.addEventListener('change', () => applyLayout(widthSlider.value, gapSlider.value, false, true));
        hideLikedToggle.addEventListener('change', () => {
            hideLikedEnabled = hideLikedToggle.checked;
            if (typeof GM_setValue === 'function') GM_setValue(HIDE_LIKED_STORAGE_KEY, hideLikedEnabled);
            refreshCards();
        });
        enableStableSliderDrag(
            widthSlider,
            (value) => applyLayout(value, gapSlider.value),
            (value) => applyLayout(value, gapSlider.value, true, false)
        );
        enableStableSliderDrag(
            gapSlider,
            (value) => applyLayout(widthSlider.value, value),
            (value) => applyLayout(widthSlider.value, value, false, true)
        );
        tabList.appendChild(layoutControls);
        applyLayout(preferredCardWidth, preferredColumnGap);
    }

    function ensureLiveRow() {
        const tabs = document.querySelector('.bili-dyn-list-tabs');
        const asideLive = document.querySelector('.bili-dyn-home--member > aside.left .bili-dyn-live-users');
        const currentLive = liveRow?.querySelector('.bili-dyn-live-users');
        const liveModule = asideLive || currentLive;
        if (!tabs || !liveModule) return;

        if (!liveRow?.isConnected) {
            liveRow = document.createElement('div');
            liveRow.id = 'tuntun-bilibili-live-row';
            tabs.before(liveRow);
        }

        if (asideLive && currentLive && asideLive !== currentLive) {
            currentLive.remove();
        }
        if (liveModule.parentElement !== liveRow) {
            liveRow.appendChild(liveModule);
        }
    }

    function isVideoTabSelected() {
        const activeTab = Array.from(document.querySelectorAll(VIDEO_TAB_SELECTOR))
            .find((tab) => tab.classList.contains('active'));

        if (activeTab) {
            return activeTab.textContent.trim() === '视频投稿';
        }

        return new URL(location.href).searchParams.get('tab') === 'video';
    }

    function isLiked(card) {
        const likeButton = card.querySelector(LIKE_SELECTOR);
        return Boolean(likeButton && likeButton.classList.contains('active'));
    }

    function isFoldPlaceholder(card) {
        const innerCard = card.querySelector(':scope > .bili-dyn-item');
        const previousCard = card.previousElementSibling;

        if (!innerCard || innerCard.children.length > 0 || innerCard.textContent.trim()) {
            return false;
        }

        return Boolean(
            previousCard &&
            previousCard.matches(CARD_SELECTOR) &&
            previousCard.querySelector('.bili-dyn-item__fold')
        );
    }

    function refreshCards() {
        const shouldHideLiked = hideLikedEnabled && isVideoTabSelected();
        document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
            const shouldHideCard = isFoldPlaceholder(card) || (shouldHideLiked && isLiked(card));
            card.classList.toggle(HIDDEN_CLASS, shouldHideCard);
        });
    }

    let refreshQueued = false;
    function queueRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        requestAnimationFrame(() => {
            refreshQueued = false;
            ensureLiveRow();
            ensureLayoutControls();
            refreshCards();
        });
    }

    function start() {
        preferredCardWidth = readStoredNumber(WIDTH_STORAGE_KEY, DEFAULT_CARD_WIDTH);
        preferredColumnGap = readStoredNumber(GAP_STORAGE_KEY, DEFAULT_COLUMN_GAP);
        hideLikedEnabled = readStoredBoolean(HIDE_LIKED_STORAGE_KEY, true);
        addStyles();
        ensureLiveRow();
        ensureLayoutControls();
        applyLayout(preferredCardWidth, preferredColumnGap);
        refreshCards();

        const observer = new MutationObserver(queueRefresh);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });

        window.addEventListener('popstate', queueRefresh);
        window.addEventListener('resize', () => applyLayout(preferredCardWidth, preferredColumnGap));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

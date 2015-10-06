/*globals define, DEBUG, WebGMEGlobal, $ */
define([
    'js/logger',
    'js/Layouts/DefaultLayout',
    'text!./templates/MinimumWorkingLayout.html',
    'text!./MinimumWorkingLayoutConfig.json'
], function(
    Logger,
    DefaultLayout,
    defaultLayoutTemplate,
    LayoutConfigJSON
) {
    'use strict';
    
    var CONFIG = JSON.parse(LayoutConfigJSON),
        SPACING_OPEN_TOUCH = 10,
        SPACING_CLOSED_TOUCH = 10,
        SPACING_OPEN_DESKTOP = 3,
        SPACING_CLOSED_DESKTOP = 6,
        SPACING_OPEN = WebGMEGlobal.SUPPORTS_TOUCH ? SPACING_OPEN_TOUCH : SPACING_OPEN_DESKTOP,
        SPACING_CLOSED = WebGMEGlobal.SUPPORTS_TOUCH ? SPACING_CLOSED_TOUCH : SPACING_CLOSED_DESKTOP,
        SIDE_PANEL_WIDTH = 202;
    var MinimumWorkingLayout = function(params) {
        this._logger = (params && params.logger) || Logger.create('gme:Layouts:DefaultLayout',
            WebGMEGlobal.gmeConfig.client.log);
        this.panels = CONFIG.panels;
        this._template = (params && params.template) || defaultLayoutTemplate;
    };

    MinimumWorkingLayout.prototype.init = function() {
        var self = this;

        this._body = $('body');
        this._body.html(this._template);

        this._centerPanel = this._body.find('div.ui-layout-center');
        this._toolboxPanel = this._body.find('div.ui-layout-east');

        this._headerPanel = this._body.find('div.ui-layout-north');
        this._footerPanel = this._body.find('div.ui-layout-south');

        this._centerPanels = [];
        this._toolbox = null;
        this._body.layout({
            north: {
                closable: false,
                resizable: false,
                slidable: false,
                spacing_open: 0, //jshint ignore: line
                size: 64
            },
            south: {
                closable: false,
                resizable: false,
                slidable: false,
                spacing_open: 0, //jshint ignore: line
                size: 27        //has to match footer CSS settings (height + border)
            },
            east: {
                size: SIDE_PANEL_WIDTH,
                minSize: SIDE_PANEL_WIDTH,
                resizable: true,
                slidable: false,
                spacing_open: SPACING_OPEN, //jshint ignore: line
                spacing_closed: SPACING_CLOSED, //jshint ignore: line
                onresize: function (/*paneName, paneElement, paneState, paneOptions, layoutName*/) {
                    self._onToolboxResize();
                }
            },
            center: {
                onresize: function (/*paneName, paneElement, paneState, paneOptions, layoutName*/) {
                    self._onCenterResize();
                }
            }
        });
    };

    MinimumWorkingLayout.prototype.addToContainer = function(panel, container) {
        if (container === 'header') {
            this._headerPanel.append(panel.$pEl);
        } else if (container === 'footer') {
            this._footerPanel.append(panel.$pEl);
        } else if (container === 'toolbox') {
            this._toolboxPanel.append(panel.$pEl);
            this._onToolboxResize();
        } else if (container === 'center') {
            this._centerPanel.append(panel.$pEl);
            this._centerPanels.push(panel);
            this._onCenterResize();
            return this._onCenterResize;
        }
        console.log('adding panel', panel, 'to container', container);
    };

    MinimumWorkingLayout.prototype.remove = function(panel) {
        DefaultLayout.prototype.remove.call(this, panel);
        console.log('removing panel!', panel);
    };

    MinimumWorkingLayout.prototype.destroy = function() {
        DefaultLayout.prototype.remove.call(this);
        console.log('destroying layout!');
    };

    // Resize handlers
    MinimumWorkingLayout.prototype._onCenterResize = DefaultLayout.prototype._onCenterResize;
    MinimumWorkingLayout.prototype._onToolboxResize = function() {
        if (this._toolbox) {
            this._toolbox.setSize(this._toolboxPanel.width(), this._toolboxPanel.height());
        }
    };

    return MinimumWorkingLayout;
});

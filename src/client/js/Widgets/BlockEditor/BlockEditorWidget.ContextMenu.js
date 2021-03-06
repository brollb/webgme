/*globals define*/
/*jshint browser: true*/

/**
 * @author brollb / https://github/brollb
 *
 * STRING CONSTANT DEFINITIONS USED IN CONSTRAINT EDITOR
 */

define(['js/Controls/ContextMenu'], function (ContextMenu) {

    'use strict';

    var BlockEditorWidgetContextMenu;

    BlockEditorWidgetContextMenu = function () {
    };

    BlockEditorWidgetContextMenu.prototype.createMenu = function (menuItems, fnCallback, position) {
        var logger = this.logger,
            menu;

        menu = new ContextMenu({
            items: menuItems,
            callback: function (key) {
                logger.debug('BlockEditorWidgetContextMenu_clicked: ' + key);
                if (fnCallback) {
                    fnCallback(key);
                }
            }
        });

        position = position || {x: 200, y: 200};
        menu.show(position);
    };

    return BlockEditorWidgetContextMenu;
});

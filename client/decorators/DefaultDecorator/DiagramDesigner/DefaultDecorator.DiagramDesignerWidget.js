"use strict";

define(['js/Constants',
    'js/NodePropertyNames',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.DecoratorBase',
    'text!./DefaultDecorator.DiagramDesignerWidget.html',
    'css!./DefaultDecorator.DiagramDesignerWidget'], function (CONSTANTS,
                                                       nodePropertyNames,
                                                       DiagramDesignerWidgetDecoratorBase,
                                                       defaultDecoratorTemplate) {

    var DefaultDecorator,
        __parent__ = DiagramDesignerWidgetDecoratorBase,
        __parent_proto__ = DiagramDesignerWidgetDecoratorBase.prototype,
        DECORATOR_ID = "DefaultDecorator";

    DefaultDecorator = function (options) {
        var opts = _.extend( {}, options);

        __parent__.apply(this, [opts]);

        this.name = "";

        this.logger.debug("DefaultDecorator ctor");
    };

    _.extend(DefaultDecorator.prototype, __parent_proto__);
    DefaultDecorator.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    DefaultDecorator.prototype.$DOMBase = $(defaultDecoratorTemplate);

    DefaultDecorator.prototype.on_addTo = function () {
        var self = this;

        this._renderName();

        // set title editable on double-click
        this.skinParts.$name.on("dblclick.editOnDblClick", null, function (event) {
            if (self.hostDesignerItem.canvas.getIsReadOnlyMode() !== true) {
                $(this).editInPlace({"class": "",
                    "onChange": function (oldValue, newValue) {
                        self._onNodeTitleChanged(oldValue, newValue);
                    }});
            }
            event.stopPropagation();
            event.preventDefault();
        });

        //let the parent decorator class do its job first
        __parent_proto__.on_addTo.apply(this, arguments);
    };

    DefaultDecorator.prototype._renderName = function () {
        var client = this._control._client,
            nodeObj = client.getNode(this._metaInfo[CONSTANTS.GME_ID]);

        //render GME-ID in the DOM, for debugging
        this.$el.attr({"data-id": this._metaInfo[CONSTANTS.GME_ID]});

        if (nodeObj) {
            this.name = nodeObj.getAttribute(nodePropertyNames.Attributes.name) || "";
        }

        //find name placeholder
        this.skinParts.$name = this.$el.find(".name");
        this.skinParts.$name.text(this.name);
    };

    DefaultDecorator.prototype.update = function () {
        var client = this._control._client,
            nodeObj = client.getNode(this._metaInfo[CONSTANTS.GME_ID]),
            newName = "";

        if (nodeObj) {
            newName = nodeObj.getAttribute(nodePropertyNames.Attributes.name) || "";

            if (this.name !== newName) {
                this.name = newName;
                this.skinParts.$name.text(this.name);
            }
        }
    };

    DefaultDecorator.prototype.getConnectionAreas = function (id) {
        var result = [],
            edge = 10,
            LEN = 20;

        //by default return the bounding box edge's midpoints

        if (id === undefined) {
            //NORTH
            result.push( {"id": "0",
                "x1": edge,
                "y1": 0,
                "x2": this.hostDesignerItem.width - edge,
                "y2": 0,
                "angle1": 270,
                "angle2": 270,
                "len": LEN} );

            //EAST
            result.push( {"id": "1",
                "x1": this.hostDesignerItem.width,
                "y1": edge,
                "x2": this.hostDesignerItem.width,
                "y2": this.hostDesignerItem.height - edge,
                "angle1": 0,
                "angle2": 0,
                "len": LEN} );

            //SOUTH
            result.push( {"id": "2",
                "x1": edge,
                "y1": this.hostDesignerItem.height,
                "x2": this.hostDesignerItem.width - edge,
                "y2": this.hostDesignerItem.height,
                "angle1": 90,
                "angle2": 90,
                "len": LEN} );

            //WEST
            result.push( {"id": "3",
                "x1": 0,
                "y1": edge,
                "x2": 0,
                "y2": this.hostDesignerItem.height - edge,
                "angle1": 180,
                "angle2": 180,
                "len": LEN} );
        }

        return result;
    };

    /**************** EDIT NODE TITLE ************************/

    DefaultDecorator.prototype._onNodeTitleChanged = function (oldValue, newValue) {
        var client = this._control._client;

        client.setAttributes(this._metaInfo[CONSTANTS.GME_ID], nodePropertyNames.Attributes.name, newValue);
    };

    /**************** END OF - EDIT NODE TITLE ************************/

    return DefaultDecorator;
});
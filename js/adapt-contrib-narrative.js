define([
    'coreJS/adapt',
    'coreViews/componentViewDifferential'
], function(Adapt, ComponentViewDifferential) {

    var Narrative = ComponentViewDifferential.extend({

        redrawOn: [
            "_isDesktop",
            "_hasNavigationInTextArea",
            "displayTitle",
            "body",
            "title",
            "_stage",
            "_items",
            "_slideWidth",
            "_fullSlideWidth",
            "_marginDir",
            "strapline",
            "_graphic",
            "_isComplete"
        ],

        redrawDebug: true,

        preRender: function() {
            this.checkIfResetOnRevisit();
            this.setDeviceSize();
            this.setMarginDirection();
            this.setupViewState();
        },

        checkIfResetOnRevisit: function() {
            var isResetOnRevisit = this.model.get('_isResetOnRevisit');

            // If reset is enabled set defaults
            if (isResetOnRevisit) {
                this.model.reset(isResetOnRevisit);
                this.state.set("_stage", 0);

                _.each(this.model.get('_items'), function(item) {
                    item.visited = false;
                });
            }
        },

        setDeviceSize: function() {
            if (Adapt.device.screenSize === 'large') {
                this.state.set("_isDesktop", true);
            } else {
                this.state.set("_isDesktop", false);
            }
        },

        setMarginDirection: function() {
            if (Adapt.config.get('_defaultDirection') == 'rtl') {
                this.state.set("_marginDir", 'right');
            } else {
                this.state.set("_marginDir", 'left');
            }
        },

        setupViewState: function() {
            this.state.set("_itemCount", this.model.get('_items').length);
            this.state.set("_active", true);
        },

        postRender: function() {
            this.$('.narrative-slider').imageready(_.bind(function() {
                this.setReadyStatus();
            }, this));
            this.setupNarrative();
        },

        setupNarrative: function() {
            this.setInitialStage();
            this.calculateWidths();

            if (Adapt.device.screenSize !== 'large' && !this.model.get('_wasHotgraphic')) {
                this.replaceInstructions();
            }

            this.setupEventListeners();

            this.setupNavigationInTextArea();
        },

        setInitialStage: function() {
            if (this.state.get("_stage")) {
                this.setStage(this.state.get("_stage"), true);
            } else {
                this.setStage(0, true);
            }
        },

        setStage: function(stage, initial) {
            this.state.set("_stage", stage);

            if (this.state.get("_isDesktop")) {
                // Set the visited attribute for large screen devices
                var currentItem = this.getCurrentItem(stage);
                currentItem.visited = true;
            }

            this.evaluateNavigation();
            this.evaluateCompletion();

            this.moveSliderToIndex(stage, !initial);

            this.once("rendered", _.bind(function() {
                if (this.state.get("_isDesktop")) {
                    if (!initial) this.$('.narrative-content-item').eq(stage).a11y_focus();
                } else {
                    if (!initial) this.$('.narrative-popup-open').a11y_focus();
                }
            }, this));

        },

        getCurrentItem: function(index) {
            return this.model.get('_items')[index];
        },

        evaluateCompletion: function() {
            if (this.getVisitedItems().length === this.model.get('_items').length) {
                this.trigger('allItems');
            } 
        },

        getVisitedItems: function() {
            return _.filter(this.model.get('_items'), function(item) {
                return item.visited;
            });
        },

        evaluateNavigation: function() {
            var currentStage = this.state.get("_stage");
            var itemCount = this.state.get("_itemCount");
            if (currentStage == 0) {
                this.state.set("_showLeft", false);
                if (itemCount > 1) {
                    this.state.set("_showRight", true);
                }
            } else {
                this.state.set("_showLeft", true);
                if (currentStage == itemCount - 1) {
                    this.state.set("_showRight", false);
                } else {
                    this.state.set("_showRight", true);
                }
            }
        },

        moveSliderToIndex: function(itemIndex) {
            var extraMargin = parseInt(this.$('.narrative-slider-graphic').css('margin-right'));
            var movementSize = this.$('.narrative-slide-container').width() + extraMargin;
            this.state.set("_margin", -(movementSize * itemIndex) +"px");
        },

        calculateWidths: function() {
            var slideWidth = this.$('.narrative-slide-container').width();
            var slideCount = this.state.get("_itemCount");
            var marginRight = this.$('.narrative-slider-graphic').css('margin-right');
            var extraMargin = marginRight === '' ? 0 : parseInt(marginRight);
            var fullSlideWidth = (slideWidth + extraMargin) * slideCount;
            var iconWidth = this.$('.narrative-popup-open').outerWidth();

            this.state.set("_slideWidth", slideWidth+"px");
            this.state.set("_fullSlideWidth", fullSlideWidth+"px");

            var stage = this.state.get("_stage");
            var margin = -(stage * slideWidth);

            this.state.set("_margin", margin+"px");
            this.state.set("_finalItemLeft", fullSlideWidth - slideWidth);
        },

        replaceInstructions: function() {
            if (Adapt.device.screenSize === 'large') {
                this.state.set("instruction", this.model.get('instruction'));
            } else if (this.model.get('mobileInstruction') && !this.model.get('_wasHotgraphic')) {
                this.state.set("instruction", this.model.get('mobileInstruction'));
            }
        },

        setupEventListeners: function() {
            this.listenTo(Adapt, 'device:changed', this.reRender, this);
            this.listenTo(Adapt, 'device:resize', this.resizeControl, this);
            this.listenTo(Adapt, 'notify:closed', this.closeNotify, this);
            this.setupCompletionEvents();
        },

        reRender: function() {
            if (this.model.get('_wasHotgraphic') && Adapt.device.screenSize == 'large') {
                this.replaceWithHotgraphic();
            } else {
                this.resizeControl();
            }
        },

        replaceWithHotgraphic: function() {
            if (this._isRemoved) return;
            
            if (!Adapt.componentStore.hotgraphic) throw "Hotgraphic not included in build";
            var Hotgraphic = Adapt.componentStore.hotgraphic;
            
            var model = this.prepareHotgraphicModel();
            var newHotgraphic = new Hotgraphic({ model: model });
            var $container = $(".component-container", $("." + this.model.get("_parentId")));

            $container.append(newHotgraphic.$el);
            this.remove();
            _.defer(function() {
                Adapt.trigger('device:resize');
            });
        },

        prepareHotgraphicModel: function() {
            var model = this.model;
            model.set('_component', 'hotgraphic');
            model.set('body', model.get('originalBody'));
            model.set('instruction', model.get('originalInstruction'));
            return model;
        },

        resizeControl: function() {
            this.setDeviceSize();
            this.replaceInstructions();
            this.calculateWidths();
            this.evaluateNavigation();
        },

        closeNotify: function() {
            this.evaluateCompletion()
        },

        setupCompletionEvents: function() {
            this.completionEvent = (!this.model.get('_setCompletionOn')) ? 'allItems' : this.model.get('_setCompletionOn');
            if (this.completionEvent !== 'inview') {
                this.on(this.completionEvent, _.bind(this.onCompletion, this));
            } else {
                this.$('.component-widget').on('inview', _.bind(this.inview, this));
            }
        },

        onCompletion: function() {
            this.setCompletionStatus();
            if (this.completionEvent && this.completionEvent != 'inview') {
                this.off(this.completionEvent, this);
            }
        },

        inview: function(event, visible, visiblePartX, visiblePartY) {
            if (visible) {
                if (visiblePartY === 'top') {
                    this._isVisibleTop = true;
                } else if (visiblePartY === 'bottom') {
                    this._isVisibleBottom = true;
                } else {
                    this._isVisibleTop = true;
                    this._isVisibleBottom = true;
                }

                if (this._isVisibleTop && this._isVisibleBottom) {
                    this.$('.component-inner').off('inview');
                    this.setCompletionStatus();
                }
            }
        },

        setupNavigationInTextArea: function() {
            // if hasNavigationInTextArea set margin left 
            var hasNavigationInTextArea = this.model.get('_hasNavigationInTextArea');
            if (hasNavigationInTextArea == true) {

                var indicatorWidth = this.$('.narrative-indicators').width();
                var marginLeft = indicatorWidth / 2;
                
                this.state.set("_indicatorsMarginLeft", '-' + marginLeft + 'px');
            }
        },

        events: {
            'click .narrative-strapline-title': 'openPopup',
            'click .narrative-controls': 'onNavigationClicked',
            'click .narrative-indicators .narrative-progress': 'onProgressClicked'
        },

        openPopup: function(event) {
            event.preventDefault();
            var currentItem = this.getCurrentItem(this.state.get("_stage"));
            var popupObject = {
                title: currentItem.title,
                body: currentItem.body
            };

            // Set the visited attribute for small and medium screen devices
            currentItem.visited = true;

            Adapt.trigger('notify:popup', popupObject);
        },

        onNavigationClicked: function(event) {
            event.preventDefault();

            if (!this.state.get("_active")) return;

            var stage = this.state.get("_stage");
            var numberOfItems = this.state.get("_itemCount");

            if ($(event.currentTarget).hasClass('narrative-control-right')) {
                stage++;
            } else if ($(event.currentTarget).hasClass('narrative-control-left')) {
                stage--;
            }
            stage = (stage + numberOfItems) % numberOfItems;

            this.setStage(stage);
        },
        
        onProgressClicked: function(event) {
            event.preventDefault();
            var clickedIndex = $(event.target).index();
            this.setStage(clickedIndex);
        }

    });

    Adapt.register('narrative', Narrative);

    return Narrative;

});

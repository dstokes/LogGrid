/**
 * Grids
 * Canvas implentation of an electronic driver log grid
 *
 * Usage:
 * var logGrid = new Grid( 'id', params );
 */
var Grid = (function() {

    //Constructor
    var grid = function(container, params) { 
        params = params || {};

        //The grids container element
        this.container = document.getElementById(container);
        
        //Function to be fired on grid change
        this.callBack = params.onUpdate || function() {};
        
        /**
         * A string representation of the log grid
         * 
         * Grid string value is a 96 character string
         * representation of a log grid with each character
         * representing a 15 minute increment in a 24 hour
         * period, and a duty status at that increment.
         *
         * Example:
         * '1133' represents an hour where the duty status
         * changes from off-duty to driving 30 mins in
         */
        var gridStr = params.gridStr || '';
        
        /**
         * An array representation of the grid string
         */
        this.times = this.constructTimesArray(gridStr);
        
        //Grid is editable
        this.readOnly = params.readOnly || false;
        
        //Dimensions of the canvas
        this.world = { 
            width: this.container.clientWidth, 
            height: this.container.clientHeight 
        };
        
        //Color of duty status line
        this.dutyColor = this.readOnly ? 'black' : 'blue' ;
        
        //Used for tracking drag events
        this.mouseDown = false;
        
        /**
         * Container for managing draw state
         *
         * On each drag event, keep track of drag range 
         * and the duty status of said range. Use this to
         * draw to the canvas when the drag event ends.
         */
        this.drag = {};
        
        //Init
        this.constructCanvas();
    };
    
    grid.prototype = {
    
        //Build the canvas element and setup observers
        constructCanvas: function() {
            var border = 2;
            
            //Create the grid canvas element
            //This canvas will display the grid lines and
            //inherit dimensions from the container
            var gc = document.createElement('canvas');
            gc.style.cssText = ';' + 'position: absolute; background-color: white; z-index: 1000;';
            gc.width = this.world.width;
            gc.height = this.world.height;
            this.container.appendChild(this.gridCanvas = gc);
            
            //Create the duty status canvas
            //This canvas will display the durty status line
            //and also inherits dimensions from the container
            var dc = document.createElement('canvas'), self = this;
            dc.style.cssText = ';' + 'position: absolute; z-index: 1100;';
            dc.width = this.world.width;
            dc.height = this.world.height;
            this.container.appendChild(this.dutyCanvas = dc);
            
            //Setup observers
            if(! this.readOnly) {
                var events = ['mousemove', 'mousedown', 'mouseup', 'mouseout'];
                for(var i = 0; i < events.length; i++) {
                    (function(evt) {
                        self.dutyCanvas.addEventListener(evt, function(e) { 
                            self[evt + 'Handler'](e); //Event handler
                        }, false);
                    })(events[i]);    
                }
            }
            
            //Disable text selection
            this.dutyCanvas.onselectstart = function() { return false; }; 
            
            //Draw the grid and duty status line
            this.drawLogGrid();
            this.drawDutyStatusLine();
            
            //Fire callback
            if(! this.readOnly)
                this.callBack();
            
        },
        
        /**
         * Handle canvas mousedown handler
         *
         * Track mouse clicks and the location of the start
         * of a draw range.
         *
         * @param {Event} e the mousedown event
         */
        mousedownHandler: function(e) {
            this.mouseDown = true;
            this.updateDrag( this.getMouseTime(e) );
        },
        
        /**
         * Handle mouseup event
         *
         * Save the draw state, clear and redraw then execute
         * grid update callback (switching from  custom event)
         */
        mouseupHandler: function(e) {
            this.mouseDown = false;
            this.saveDrag();
            this.clearDutyLines();
            this.drawDutyStatusLine();
            
            //Notify of changed grid
            if(! this.readOnly )
                this.callBack();            
        },
        
        /**
         * Handle the canvas mouse move event
         *
         * @param {Event} e the mouse move event
         */
        mousemoveHandler: function(e) { 
            if(! this.mouseDown) return false;
            this.updateDrag( this.getMouseTime(e) ); //Update draw state
            this.clearDutyLines();   //Clear duty lines
            this.drawDutyStatusLine()     //Redraw
        },
        
        /**
         * Handle canvas mouseout event
         * 
         * Consider the end of the drag event to be 96 (24.0)
         * and call the mouseup handler to end dragging
         */
        mouseoutHandler: function(e) {
            if( this.drag.range && this.drag.range.end > 93 ) {
                this.drag.range.end = 96;
                this.mouseupHandler();
            }
        },
        
        /**
         * Convert mouse coordinates into time and duty object
         *
         * Takes real-time mouse coordinates and determines
         * their hour and duty location on the grid
         *
         * @param {Event} e the mouse event
         */
        getMouseTime: function(e) { 
            var timeIncrmnt = this.world.width / 96,
                dutyIncrmnt = this.world.height / 4,
                offset = getOffset(this.container),
                scroll = getScrollOffset(this.gridCanvas),
                mx = e.clientX - (offset[0] - scroll[0]),
                my = e.clientY - (offset[1]+1) + scroll[1];
                
            var x =  mx / timeIncrmnt | 0,
                y = (my / dutyIncrmnt | 0) + 1;
                
            return { min: x, duty: y };
        },
        
        /**
         * Update the draw state
         *
         * Takes care of managing the draw state during
         * mousedown and mousemove events
         *
         * @param {Object} m object representing mouse time and duty calculation
         */
        updateDrag: function(m) {
            this.drag.range = this.drag.range || { start: m.min };
            this.drag.range.end = m.min;
            this.drag.duty = m.duty;
        },
        
        /**
         * Saved dragged info
         *
         * When finished dragging on the canvas
         * save the generated duty hours definitions
         * to the times array
         */
        saveDrag: function() {
            var r = this.drag.range; 
            for( var i = r.start; i < r.end; i++ )
                this.times[i] = this.drag.duty;
            this.drag = {};
        },
        
        /**
         * Draw the log grid lines
         *
         * Uses the lowest canvas layer to draw the grid
         * lines found on a normal driver log. Called 
         * once on instantiation
         */
        drawLogGrid: function() { 
            var ctx = this.gridCanvas.getContext('2d'),
                minuteW = this.world.width / 96,
                hourW = this.world.width / 24;
            
            ctx.lineWidth = 1;
            
            //Draw half hour lines
            ctx.beginPath();
            ctx.strokeStyle = '#ccc';
            for(var i = 1; i <= 24; i++) {
                var hourX = ((hourW * i) + 0.5) - hourW / 2;
                ctx.moveTo(hourX, 10 );
                ctx.lineTo(hourX, this.world.height - 10 );
            }
            ctx.stroke();
            ctx.closePath();
            
            //Draw hour lines
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            for(var i = 1; i <= 24; i++) {
                var hourX = (hourW * i) + 0.5;
                ctx.moveTo(hourX, 0);
                ctx.lineTo(hourX, this.world.height);
            }
            
            //Draw status lines
            for(var d = 1; d <= 3; d++) {
                var dutyY = ((this.world.height / 4) * d) + 0.5;
                ctx.moveTo(0, dutyY);
                ctx.lineTo(this.world.width, dutyY);
            }
            ctx.stroke();
            ctx.closePath();
        },
        
        /**
         * Draw duty status lines
         *
         * Uses the this.times array to draw duty status lines.
         */
        drawDutyStatusLine: function() {
            var ctx = this.dutyCanvas.getContext('2d'),
                hourInc = this.world.width / 96,
                dutyInc = this.world.height / 4,
                lastDuty = false;
            
            ctx.lineWidth = 2;
            
            //Draw duty status lines
            ctx.beginPath();
            ctx.strokeStyle = this.dutyColor;
            for( var i = 0, l = this.times.length; i < l; i++ ) {
                var val = this.times[i],
                    y = (dutyInc * val) - (dutyInc / 2),
                    x = i * hourInc;
                    
                //Draw vertial line
                if(lastDuty && lastDuty != val) { 
                    var py = ((dutyInc * lastDuty) - (dutyInc / 2)) + 0.5;
                    ctx.moveTo(x, py);
                    ctx.lineTo(x, y);
                }
                
                lastDuty = val;
                ctx.moveTo(x, y);
                ctx.lineTo((x + hourInc), y);
            }
            ctx.closePath();
            ctx.stroke();
            
            
            //Draw drag line if one exists
            if( 'range' in this.drag ) {
                var r = this.drag.range;
                
                ctx.beginPath();
                ctx.strokeStyle = 'red';
                for( var i = r.start; i < r.end; i++ ) {
                    var y = (dutyInc * this.drag.duty) - (dutyInc / 2),
                        x = i * hourInc;
                    ctx.moveTo(x, y);
                    ctx.lineTo((x + hourInc), y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        },
        
        /**
         * Clear duty status lines from the grid
         */
        clearDutyLines: function() {
            var c = this.dutyCanvas.getContext('2d');
            c.clearRect( 0, 0, this.world.width, this.world.height);
        },
        
        /**
         * Convert the times array into a string
         */
        toString: function() {
            return this.times.join('');
        },
        
        /**
         * Convert grid string into hour totals
         *
         * Takes the times array and totals each duty number
         * (1 through 4) to create duty status hour totals
         *
         * @return {Object} the object containing the hour totals 
         */
        getHourTotals: function() {
            if(this.times.length == 0) return false;
            var str = this.toString(),
                types = 'off sleeper drive onduty'.split(' '),
                totals = {};
                
            for( var i = 0; i < types.length; i++ ) {
                var duty = i + 1,
                    reg = new RegExp(duty, 'g'),
                    finds = str.match( reg );
                totals[types[i]] = finds ? (finds.length / 4) : 0;
            }
            return totals;
        },
    
        /**
         * Build a times array for grid string
         *
         * The grid string is a 96 digit number that represents the 
         * duty status of a driver for each 15 minute increment during
         * 24 hour period.
         *
         * If a valid string is provided, split it into an array
         * otherwise create an array of 1's to indicate 24 hours off-duty
         *
         * @return {Array} the array containing each quarter hours duty number
         */
        constructTimesArray: function(str) {
            var gridStr = str || '', timeArr = [];
            if( gridStr && gridStr.length == 96 ) {
                timeArr = gridStr.split('');
            } else {
                for( var i = 0; i < 96; i++ ) 
                      timeArr.push(1);
            }
            return timeArr;
        }
        
    };
    
    /**
     * Calculate offset of element
     *
     * Borrowed from prototype.js
     * Loop through elements and add up offsets
     * until reaching the top of the document.
     *
     * @param {Object} element the element
     * @return {Array} the offsets
     */
    function getOffset(element) {
        var top = 0, left = 0;
        do {
          top += element.offsetTop || 0;
          left += element.offsetLeft || 0;
          element = element.offsetParent;
        } while (element);
        return [left, top];
    }
    
    /**
     * Calculate scroll offset of element
     *
     * Also borrowed from prototype.js
     * Loop through the elements and add up
     * scroll offsets until reaching the top
     * of the document.
     *
     * @param {Object} element the element
     * @return {Array} the offsets
     */
    function getScrollOffset(element) {
        var top = 0, left = 0;
        do {
          top += element.scrollTop || 0;
          left += element.scrollLeft || 0;
          element = element.parentNode;
        } while (element);
        return [left, top];
    }
    
    return grid;

})();
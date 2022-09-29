<<<<<<< HEAD
function getNodeSize(node)// node : the html element we want to measure
{
  const nodeStyles = window.getComputedStyle(node, null);

  let convertToFloat = (nb_str) => { return nb_str?parseFloat(nb_str):0 };

  return {
    width : (node.offsetWidth - convertToFloat(nodeStyles.borderLeftWidth) - convertToFloat(nodeStyles.borderRightWidth) 
    - convertToFloat(nodeStyles.paddingLeft) - convertToFloat(nodeStyles.paddingRight)),

    height : (node.offsetHeight - convertToFloat(nodeStyles.borderTopHeight) - convertToFloat(nodeStyles.borderBottomHeight) 
    - convertToFloat(nodeStyles.paddingTop) - convertToFloat(nodeStyles.paddingBottom))
  }

=======
function getNodeSize(node, whatWeMeasure)// node : the html element we want to measure, whatWeMeasure : a String (either "width" or "height")
{
  const nodeStyles = window.getComputedStyle(node, null);

  let pureSize, border1, border2, padding1, padding2 = undefined;
  let convertToFloat = (nb_str) => { return nb_str?parseFloat(nb_str):0 };

  if (whatWeMeasure == "width")
  {
    pureSize = node.offsetWidth;

    border1 = nodeStyles.borderLeftWidth;
    border2 = nodeStyles.borderRightWidth;
    padding1 = nodeStyles.paddingLeft;
    padding2 = nodeStyles.paddingRight;
  }
  else if (whatWeMeasure == "height")
  {
    pureSize = node.offsetHeight;

    border1 = nodeStyles.borderTopHeight;
    border2 = nodeStyles.borderBottomHeight;
    padding1 = nodeStyles.paddingTop;
    padding2 = nodeStyles.paddingBottom;
  }


  return (pureSize - convertToFloat(border1) - convertToFloat(border2) - convertToFloat(padding1) - convertToFloat(padding2));

>>>>>>> code refractoring + file moved into a cleaner hierarchie + python test changed
}

Vue.component('vue-responsive-text', {
  name: 'vue-responsive-text',
  props: {
    isTelem: {type: Boolean, required: false},
    isUnit: {type: Boolean, required: false},
    isValue: {type: Boolean, required: false},
    // fillColor : {type: String, required: false},
    // strokeColor : {type: String, required: false},
  },
  data() {
    return {
      scale: 1,
      currentWidth: null,
      maxWidth: null,
      currentHeight: null,
      maxHeight: null,
    };
  },
  computed: {
    scaleStyle() {
      const scaleValue = `scale(${this.scale}, ${this.scale})`;
      return {
        msTransform: scaleValue,
        WebkitTransform: scaleValue,
        OTransform: scaleValue,
        MozTransform: scaleValue,
        transform: scaleValue
      };
    },
  },
  /*mounted() {
    if (this.isTelem)
    {
      const theTelem = document.getElementById('current-responsive-text-wrapper');
      theTelem.style.backgroundColor = this.fillColor;
      theTelem.style.borderColor = this.strokeColor;
      theTelem.style.borderWidth = "1.5px";
      theTelem.style.borderStyle = "solid";
      theTelem.style.padding = "1px"
    }
    },*/
  methods: {
    updateScale(currentWidth, maxWidth, currentHeight, maxHeight) {
      this.scale = Math.min(maxWidth / currentWidth, maxHeight/ currentHeight);
    },
    updateNodeWidth() {
<<<<<<< HEAD
      let parentNodeSize = getNodeSize(this.$el.parentElement);
      let thisNodeSize = getNodeSize(this.$el);

      this.currentWidth = thisNodeSize.width;
      this.maxWidth = parentNodeSize.width;
      this.currentHeight = thisNodeSize.height;
      this.maxHeight = parentNodeSize.height;
=======
      this.currentWidth = getNodeSize(this.$el, "width");
      this.maxWidth = getNodeSize(this.$el.parentElement, "width");
      this.currentHeight = getNodeSize(this.$el, "height");
      this.maxHeight = getNodeSize(this.$el.parentElement, "height");
>>>>>>> code refractoring + file moved into a cleaner hierarchie + python test changed
    },
    triggerTextResize()
    {
      this.updateNodeWidth();
      this.updateScale(this.currentWidth, this.maxWidth, this.currentHeight, this.maxHeight);
    }
  },
  
  template:'<span id="current-responsive-text-wrapper"\
            v-bind:class="{ \'responsive-text-wrapper-telem\' : isTelem, \'responsive-text-wrapper-unit\' : isUnit, \'responsive-text-wrapper-value\' : isValue }"\
            :style="{ ...scaleStyle }"> \
                <slot></slot> \
            </span>'
});


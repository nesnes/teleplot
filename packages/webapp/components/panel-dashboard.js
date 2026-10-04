function initComponent_panel_dashboard_view(vue) {
    let name = "panel-dashboard-view";

    vueHTML = `
        <div v-if="view" class="panel-dashboard-view"
        :class="{'panel-dashboard-view-layout':isLayout(), 'panel-dashboard-view-highlight': dragCtx.isOver}">
          
            <div class="panel-dashboard-view-header"
            @click.stop="expanded=!expanded;"
            @mouseover.stop="highlightInDashboard(true)"
            @mouseleave.stop="highlightInDashboard(false)"

            draggable="true"
            @dragstart.stop="onDragStart($event)"
            @dragover.stop.prevent
            >
                <template v-if="!isLayout()">
                    <span v-if="view.type === 'teleplot-chart'" class="panel-dashboard-view-type">chart</span>
                    <span v-if="view.type === 'teleplot-current-value'" class="panel-dashboard-view-type">value</span>
                </template>
                <span class="panel-dashboard-view-name">{{isLayout() ? view.layout.type : view.type}}</span>
            </div>
            
            <template v-if="isLayout()" v-for="(subview, subviewIdx) of view.views" :key="subview.id">
                <div v-if="expanded && subviewIdx == 0"
                    class="panel-dashboard-view-drop"
                    :class="{'panel-dashboard-view-drop-highlight': dragCtx.isOver && dragCtx.overId === subview.id && dragCtx.overPosition == 'before'}"
                    @dragover.prevent @drop.prevent="onDragDrop($event, subview, 'before')"
                    @dragenter.stop.prevent="onDragEnter($event, subview, 'before')"
                    @dragleave.stop.prevent="onDragLeave($event, subview, 'before')"
                ></div>

                <panel-dashboard-view v-show="expanded" :view="subview" :parentView="view"/>

                <div v-if="expanded"
                    class="panel-dashboard-view-drop"
                    :class="{'panel-dashboard-view-drop-highlight': dragCtx.isOver && dragCtx.overId === subview.id && dragCtx.overPosition == 'after'}"
                    @dragover.prevent @drop.prevent="onDragDrop($event, subview, 'after')"
                    @dragenter.stop.prevent="onDragEnter($event, subview, 'after')"
                    @dragleave.stop.prevent="onDragLeave($event, subview, 'after')"
                ></div>
            </template>
        </div>
    `;

    vueCSS = `
        .panel-dashboard-view {
            display: flex;
            flex-direction: column;
            margin-left: 0.5em;
            cursor: pointer;
        }
        .panel-dashboard-view-layout {
            border: 1px solid transparent;
            position: relative
        }
        .panel-dashboard-view-layout::before {
            content: '';
            position: absolute;
            left: 0px;
            top: 1em;
            width: 2px;
            height: calc(100% - 1.5em);
            background-color: var(--color-primary);
            border-radius: 1px;
        }
        .panel-dashboard-view-layout > .panel-dashboard-view-header {
            border: 0px;
            background-color: var(--color-primary);
            border-top-left-radius: 0px;
            border-bottom-left-radius: 0px;
            padding-top: 0.1em;
            padding-bottom: 0.1em;
            width: fit-content;
            color: #fff;

            &:hover {
                background-color: var(--color-primary);
            }
        }

        .panel-dashboard-view-highlight {
            border: 1px dashed var(--color-primary);
        }
        .panel-dashboard-view-header {
            display: flex;
            flex-direction: row;
            align-items: center;
            border: 1px solid var(--color-bg);
            border-radius: 0.5em;
            z-index: 1;
        }
        .panel-dashboard-view-header:hover {
            background-color: var(--color-bg);
        }
        .panel-dashboard-view-header * {
            user-select: none;
            -webkit-user-select: none;
            -webkit-user-drag: element;
            cursor: move;
        }
        .panel-dashboard-view-type {
            background-color: var(--color-bg-dark);
            padding: 0.1em 0.2em;
        }
        .panel-dashboard-view-name {
            margin-left: 0.3em;
            padding-right: 0.5em;
        }

        .panel-dashboard-view-drop {
            height: 0.5em;
        }
        .panel-dashboard-view-drop-highlight {
            background-color: var(--color-primary);
        }
        .dashboard-layout {
            .teleplot-js-style {
                background-color: none;
            }
            .teleplot-js-view-highlight .teleplot-js-telemetry-card {
                box-shadow: 0px 0px 10px 0px #007eff94;
            }
        }
    `;
    // Add css to head
    { let elem = document.createElement('style'); elem.textContent = vueCSS; document.head.appendChild(elem); }

    return vue.component(name, {
        name: name,
        props: ["view", "parentView"],
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx };
        },
        data() {
            return {
                expanded: true,
                dragCtx : {
                    isOver: false,
                    overId: null,
                    overPosition: null
                }
            }
        },
        methods: {
            isLayout() { return this.view.type === "teleplot-layout" || this.view.type === "teleplot-stack"; },
            highlightInDashboard(highlight) { 
                let element = document.getElementById(this.view.divId);
                if (element == null) { return; }
                if (highlight) {
                    element.classList.add("teleplot-js-view-highlight");
                } else {
                    element.classList.remove("teleplot-js-view-highlight");
                }
            },
            onDragStart(event) {
                console.log("onDragStart", event);
                event.dataTransfer.setData("text/plain", '');
                this.ctx.dragevent = {
                    view: this.view,
                    parentView: this.parentView
                };
                return true;
            },
            onDragEnter(event, overView, position) {
                this.dragCtx.overId = overView.id;
                this.dragCtx.overPosition = position;
                this.dragCtx.isOver = true;
            },
            onDragLeave(event, overView, position) {
                if(this.dragCtx.overId == overView.id && this.dragCtx.overPosition == position) {
                    this.dragCtx.overId = null;
                    this.dragCtx.overPosition = null;
                    this.dragCtx.isOver = false;
                }
            },
            onDragDrop(event, overView, position) {
                // TODO: rewrite to use function from teleplot directly (to be created) -> In Vue props are readonly and cannot be updated
                console.log("drop", this.ctx.dragevent)
                if (!this.ctx.dragevent.parentView) return;
                let viewToDrop = this.TP.view.getView(this.ctx.dragevent.view.id);

                // Remove from origin
                let sourceView = this.TP.view.getView(this.ctx.dragevent.parentView.id);
                sourceView.removeView(viewToDrop.id);

                // Insert in destination
                let destinationView = this.TP.view.getView(this.view.id);
                let destinationIndex = destinationView.views.findIndex((v) => v.id === overView.id);
                if (destinationIndex === -1) return;
                destinationIndex += position=='after' ? 1 : 0;
                destinationView.addView(viewToDrop, destinationIndex);
                //this.view.views.splice(destinationIndex + (position=='after'?1:0), 0,this.ctx.dragevent.view)
                
                delete this.ctx.dragevent;
                this.dragCtx.isOver = false;
            }

        },
        template: vueHTML,
    });
}

function initComponent_panel_dashboard(vue) {
    initComponent_panel_dashboard_view(vue);

    let name = "panel-dashboard";

    vueHTML = `
        <div class="dashboard-layout">
            <panel-dashboard-view v-if="ctx.activeDashboard && ctx.activeDashboard.view" :view="ctx.activeDashboard.view" :parentView=""/>
        </div>
    `;

    vueCSS = `
        .dashboard-layout {
            display: flex;
            flex-direction: column;
        }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx };
        },
        data() {
            return {
                sampleDataInterval: false
            }
        },
        methods: {
        },
        template: vueHTML,
    });
}
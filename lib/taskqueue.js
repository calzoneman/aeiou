function TaskQueue(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.tasks = [];
    this.queue = [];
}

TaskQueue.prototype = {
    queueTask: function (task) {
        if (this.tasks.length < this.maxConcurrency) {
            this.runTask(task);
        } else {
            this.queue.push(task);
        }
    },

    runTask: function (task) {
        this.tasks.push(task);
        task.on('finished', this.onTaskComplete.bind(this, task));
        task.run();
    },

    onTaskComplete: function (task) {
        var index = this.tasks.indexOf(task);
        if (index >= 0) {
            this.tasks.splice(index, 1);
        }

        while (this.tasks.length < this.maxConcurrency && this.queue.length > 0) {
            this.runTask(this.queue.shift());
        }
    }
}

module.exports = TaskQueue;

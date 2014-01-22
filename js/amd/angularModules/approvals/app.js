define([
	'angular',
	'angular-cookies',
	'text!angularModules/approvals/templates/approvalProcess.html',
	'text!angularModules/approvals/templates/approvalPath.html',
	'text!angularModules/approvals/templates/approvalStep.html',

	// Widgets
	'angularModules/widgets/DropDown/DropDown',
	'angularModules/widgets/TypeAhead/TypeAhead',

	'angularModules/attask/i18n'
], function(angular, ngCookies, approvalProcessTemplate, approvalPathTemplate, approvalStepTemplate){
	var module = angular.module('approvals', ['ng', 'attask', 'attask.widgets', 'attask.i18n', 'attask.kamino', 'ngCookies']);

	module.factory('statusEnum', ['StreamAPIService', 'ObjCodes', function(StreamAPIService, ObjCodes){
		var statuses = {};

		return function(objCode){
			if(!statuses[objCode]){
				switch(objCode){
					case ObjCodes.Project:
						statuses[objCode] = StreamAPIService.query({
							objCode: ObjCodes.CustomEnum,
							query: 'projectStatuses'
						});

						break;

					case ObjCodes.Task:
						statuses[objCode] =  StreamAPIService.query({
							objCode: ObjCodes.CustomEnum,
							query: 'taskStatuses'
						});

						break;

					case ObjCodes.OpTask:
						statuses[objCode] =  StreamAPIService.query({
							objCode: ObjCodes.CustomEnum,
							query: 'opTaskStatuses'
						});

						break;

					default:
						throw "ObjCode " + objCode + " doesn't support statuses";
				}
			}

			return statuses[objCode];
		};
	}]);

	module.service('ApprovalStepTypes', ['StreamAPIService', 'ObjCodes', 'getMessage', function(StreamAPIService, ObjCodes, getMessage){
		return [
			{
				label: getMessage('approvaltype.rolebased'),
				value: ObjCodes.Role

			},
			{
				label: getMessage('approvaltype.teambased'),
				value: ObjCodes.Team
			},
			{
				label: getMessage('approvaltype.userbased'),
				value: ObjCodes.User
			}
		];
	}]);

	module.directive('approvals', function(){
		return {
			scope: {
				id: '@',
				projectId: '@'
			},
			template: approvalProcessTemplate,
			controllerAs: 'ctrl',
			controller: ['$scope', 'getMessage', 'StreamAPIService', 'ObjCodes', '$http', '$cookies', '$timeout', function($scope, getMessage, StreamAPIService, ObjCodes, $http, $cookies, $timeout){
				var that = this;

				this.saveState = getMessage('action.save');

				this.approvalProcess = $scope.id ? StreamAPIService.get({
					objCode: ObjCodes.ApprovalProcess,
					ID: $scope.id,
					fields: [
						'approvalPaths:*',
						'approvalPaths:approvalSteps:*',
						'approvalPaths:approvalSteps:stepApprovers:*',
						'approvalPaths:approvalSteps:stepApprovers:user',
						'approvalPaths:approvalSteps:stepApprovers:team',
						'approvalPaths:approvalSteps:stepApprovers:role'
					]
				}) : new StreamAPIService({
					objCode: ObjCodes.ApprovalProcess,
					approvalPaths: [{
						"rejectedStatus": "$$PREV",
						"shouldCreateIssue": false,
						approvalSteps:[{
							stepApprovers: []
						}]
					}]
				});

				this.save = function(){
					var aprvProc = angular.copy(this.approvalProcess),
						proj = {
						ID: $scope.projectId,//Add projectID to the scope at this time
						objCode: ObjCodes.Project,
						assign: true,
						approvalProcess: aprvProc
					};

					aprvProc = angular.extend(aprvProc, {
						"assign":true,
						"approvalObjCode":ObjCodes.Project,
						"isPrivate":true,
						"isCopy":false,
						description: ''
					});

					aprvProc.approvalPaths.forEach(function(path){
						path.assign = true;

						path.approvalSteps.forEach(function(step){
							step.assign = true;

							step.stepApprovers.forEach(function(approver){
								approver.assign = true;
							});
						});
					});

					this.saveState = getMessage('saving');

					//EWWW SO UGRY!! WRY YOU USE SPRING CLIENT? BECAUSE STREAM API DOESN'T LET US EDIT PRIVATE APPROVAL PROCESS... GAH!!!
					$http.post('/approval/save', 'form=' + encodeURIComponent(JSON.stringify(proj)), {
						headers: {
							sessionID: ($cookies.attask || '').split('#')[0],
							'Content-Type': 'application/x-www-form-urlencoded'
						}
					})//Just copy the post first, then do the promise resolution in another step
						.then(function(){
							that.saveState = getMessage('saved');

							$timeout(function(){
								that.saveState = getMessage('action.save');
							}, 1000);
						});
				};
			}]
		};
	});

	module.directive('approvalPath', function(){
		return {
			scope: {
				path: '='
			},
			template: approvalPathTemplate,
			controllerAs: 'ctrl',
			controller: ['statusEnum', 'ObjCodes', function(statusEnum, ObjCodes){
				this.statuses = statusEnum(ObjCodes.Project);
			}]
		};
	});

	module.directive('approvalStep', function(){
		return {
			scope: {
				step: '='
			},
			template: approvalStepTemplate,
			controllerAs: 'ctrl',
			controller: ['$scope', 'ApprovalStepTypes', 'ObjCodes', function($scope, ApprovalStepTypes, ObjCodes){
				var originalApprovers = $scope.step.stepApprovers;

				this.types = ApprovalStepTypes;

				this.stepApprovers = {};
				this.stepApprovers[ObjCodes.User] = [];
				this.stepApprovers[ObjCodes.Team] = [];
				this.stepApprovers[ObjCodes.Role] = [];

				var that = this,
					stepApprovers = $scope.step.stepApprovers;
				for(var i = 0; i < stepApprovers.length; i++){
					var detailObj = null;

					if(stepApprovers[i].roleID){
						detailObj = stepApprovers[i].role;
					}
					else if(stepApprovers[i].teamID){
						detailObj = stepApprovers[i].team;
					}
					else if(stepApprovers[i].userID){
						detailObj = stepApprovers[i].user;
					}
					else {
						throw {
							message: "Invalid step approver type",
							obj: stepApprovers[i]
						};
					}

					//This seems a little weird but it is the simplest way of figuring out what type of step this is
					this.selectedType = detailObj.objCode;

					this.stepApprovers[detailObj.objCode].push({
						'value': detailObj.ID,
						'label': detailObj.name,
						'type': detailObj.objCode
					});
				}

				this.stepApprovers[ObjCodes.Team] = this.stepApprovers[ObjCodes.Team][0];
				this.stepApprovers[ObjCodes.Role] = this.stepApprovers[ObjCodes.Role][0];

				function findApprover(approvers, approver){
					if(!approvers || !approver){
						return approver;
					}

					for(var i = 0; i < approvers.length; i++){
						if(approvers[i].userID === approver.userID ){
							return approvers[i];
						}

						if(approvers[i].teamID === approver.teamID){
							return approvers[i];
						}

						if(approvers[i].roleID === approver.roleID){
							return approvers[i];
						}
					}

					return approver;
				}

				function updateApprovers(){
					$scope.step.stepApprovers = [];

					if(that.selectedType === ObjCodes.User){
						for(var i = 0; i < that.stepApprovers[ObjCodes.User].length; i++){
							$scope.step.stepApprovers.push(findApprover(originalApprovers, {
								objCode: ObjCodes.StepApprover,
								userID:that.stepApprovers[ObjCodes.User][i].value
							}));
						}

						$scope.step.approvalType = 'ON';
					}
					else if(that.selectedType === ObjCodes.Team && that.stepApprovers[ObjCodes.Team]){
						var item = findApprover(originalApprovers, {
							objCode: ObjCodes.StepApprover,
							teamID: that.stepApprovers[ObjCodes.Team].value
						});

						if(item){
							$scope.step.stepApprovers.push(item);
						}

						$scope.step.approvalType = 'TB';
					}
					else if(that.selectedType === ObjCodes.Role && that.stepApprovers[ObjCodes.Role]){
						var item = findApprover(originalApprovers, {
							objCode: ObjCodes.StepApprover,
							roleID: that.stepApprovers[ObjCodes.Role].value
						});

						if(item){
							$scope.step.stepApprovers.push(item);
						}

						$scope.step.approvalType = 'RB';
					}
				}

				$scope.$watchCollection('ctrl.stepApprovers', updateApprovers);
				$scope.$watch('ctrl.selectedType', updateApprovers);
			}]
		};
	});

	return module;
});

define(['angular', 'angularModules/approvals/app'], function(angular){
	describe('Approvals Setup', function(){
		var $httpBackend, processElement, processScope,
			baseProcess = getJSONFixture('approvals/approvalProcess.json'),
			customStatuses = getJSONFixture('approvals/CSTEM.json'),
			dropDown, typeAhead, oracle;

		beforeEach(module('approvals'));

		beforeEach(inject(function(_$httpBackend_, AtTaskWidgets){
			var ARVPRC_REGEX = /\/attask\/api-internal\/ARVPRC\/1?[.]*/,
				CSTEM_REGEX = /\/attask\/api-internal\/CSTEM\/1?[.]*/;

			$httpBackend = _$httpBackend_;

			$httpBackend.whenGET(ARVPRC_REGEX).respond(200, {data:baseProcess});//NOTE THAT THIS IS WRAPPED IN AN OBJECT LITERAL
			$httpBackend.whenGET(CSTEM_REGEX).respond(200, {data:customStatuses});

			//NOTE This needs to be extracted into a common testing lib
			dropDown = jasmine.createSpyObj('dropDown', ['addEvent', 'clearItems', 'setValue', 'set', 'get', 'getPickList', 'setText']);
			typeAhead = jasmine.createSpyObj('typeAhead', ['getOracle', 'addEvent', 'set', 'setValue', 'reset']);
			oracle = jasmine.createSpyObj('oracle', ['set']);

			spyOn(AtTaskWidgets, "create").andCallFake(function(widget){
				if(widget === 'DropDown'){
					return dropDown;
				}
				else if(widget === 'TypeAhead'){
					return typeAhead;
				}

				return null;
			});

			dropDown.getPickList.andReturn(jasmine.createSpyObj('pickList', ['clearItems']));
			typeAhead.getOracle.andReturn(oracle);
			dropDown.addEvent.andCallFake(function(event, callback){
				if(event === 'change'){
					dropDown.changeEventCallback = callback;
				}
			});
		}));

		beforeEach(inject(function($rootScope, $compile){
			processElement = angular.element('<div approvals project-id="PROJ001" id="ARVPRC001"></div>');
			processScope = $rootScope.$new();

			processElement = $compile(processElement)(processScope);
			processScope = processElement.isolateScope();

			//processScope.$digest(); Don't think I need these digests
			$httpBackend.flush();

			//processScope.$digest(); Don't think I need these digests
		}));

		//flush the backend
		afterEach(function () {
			$httpBackend.verifyNoOutstandingExpectation();
			$httpBackend.verifyNoOutstandingRequest();
		});


		it('should have data on the controller', function(){
			expect(processScope.ctrl).toBeDefined();
			expect(processScope.ctrl.approvalProcess).toBeDefined();
			expect(processScope.ctrl.approvalProcess.name).toBe("Private Approval Process: My Project");
			expect(processScope.ctrl.approvalProcess.approvalPaths).toBeDefined();
			expect(processScope.ctrl.approvalProcess.approvalPaths.length).toBe(1);
		});

		it('should have a working save button', inject(function($timeout){
			$httpBackend.expectPOST('/approval/save').respond(200);

			var submitButton = processElement.find('button.primary');
			expect(submitButton.text()).toBe('Save');

			submitButton.click();
			expect(submitButton.text()).toBe('Saving...');

			$httpBackend.flush();
			expect(submitButton.text()).toBe('Saved');

			$timeout.flush();
			expect(submitButton.text()).toBe('Save');
		}));

		describe('Approval Paths', function(){
			var pathElement, pathScope, path;

			beforeEach(function(){
				pathElement = processElement.find('*[approval-path]');
				expect(pathElement).toBePresent();

				pathScope = pathElement.isolateScope();
				expect(pathScope).toBeDefined();

				path = pathScope.path;
				expect(path);
			});

			it('should have data', function(){
				expect(path).toBeDefined();
				expect(path).toMatch({
					"ID": "ARVPTH001",
					"objCode": "ARVPTH",
					"approvalProcessID": "ARVPRC001",
					"durationMinutes": 480,
					"durationUnit": "D",
					"rejectedStatus": "$$PREV",
					"shouldCreateIssue": false,
					"targetStatus": "CUR"
				});

				expect(path.approvalSteps).toBeDefined();
				expect(path.approvalSteps.length).toBe(1);
			});

			it('should have targetStatus affect what shows', function(){
				expect(pathElement.find('.steps-container').length).toBeTruthy();

				path.targetStatus = null;
				pathScope.$digest();

				expect(pathElement.find('.steps-container').length).toBe(0);
			});

			it('should use the dropdown', function(){
				expect(pathElement.find('.steps-container')).toBePresent();

				path.targetStatus = null;
				pathScope.$digest();

				expect(pathElement.find('.steps-container')).not.toBePresent();

				dropDown.get.andReturn('CUR');
				dropDown.changeEventCallback();
				pathScope.$digest();

				expect(pathElement.find('.steps-container')).toBePresent();
			});

			describe('Approval Steps', function(){
				var stepElement, stepScope, step;

				beforeEach(function(){
					stepElement = pathElement.find('*[approval-step]');
					expect(stepElement).toBeDefined();

					stepScope = stepElement.isolateScope();
					expect(stepScope).toBeDefined();

					step = stepScope.step;
					expect(step).toBeDefined();
				});

				it('should have data', function(){
					expect(step).toMatch({
						"ID": "ARVSTP001",
						"name": "One",
						"objCode": "ARVSTP",
						"approvalPathID": "ARVPTH001",
						"approvalType": "RB",
						"sequenceNumber": 0
					});

					expect(step.stepApprovers).toBeDefined();
					expect(step.stepApprovers.length).toBe(1);

					expect(step.stepApprovers[0]).toMatch({
						"ID": "SPAPVR001", 
						"objCode": "SPAPVR",
						"approvalStepID": "ARVSTP001",
						"roleID": "ROLE001",
						"teamID": null,
						"userID": null,
						"wildCard": null,
						"user": null,
						"team": null,
						"role": {
							"ID": "ROLE001",
							"name": "Engineer",
							"objCode": "ROLE"
						}
					});
				});

				it('should show/hide typeaheads', function(){
					expect(stepElement.find('*[oracle=ROLE]')).toBePresent();
					expect(stepElement.find('*[oracle=USER]')).not.toBePresent();
					expect(stepElement.find('*[oracle=TEAMOB]')).not.toBePresent();

					stepScope.ctrl.selectedType = 'USER';
					stepScope.$digest();

					expect(stepElement.find('*[oracle=ROLE]')).not.toBePresent();
					expect(stepElement.find('*[oracle=USER]')).toBePresent();
					expect(stepElement.find('*[oracle=TEAMOB]')).not.toBePresent();

					stepScope.ctrl.selectedType = 'TEAMOB';
					stepScope.$digest();

					expect(stepElement.find('*[oracle=ROLE]')).not.toBePresent();
					expect(stepElement.find('*[oracle=USER]')).not.toBePresent();
					expect(stepElement.find('*[oracle=TEAMOB]')).toBePresent();

				});

				it('should transform stepApprovers properly', function(){
					expect(stepScope.ctrl.stepApprovers).toMatch({
						USER: [],
						TEAMOB: undefined,
						ROLE: {
							value: 'ROLE001',
							label: 'Engineer',
							type: 'ROLE'
						}
					});

					expect(step.stepApprovers.length).toBe(1);
					expect(step.stepApprovers).toContain({
						"ID": "SPAPVR001",
						"objCode": "SPAPVR",
						"approvalStepID": "ARVSTP001",
						"roleID": "ROLE001",
						"teamID": null,
						"userID": null,
						"wildCard": null,
						"user": null,
						"team": null,
						"role": {
							"ID": "ROLE001",
							"name": "Engineer",
							"objCode": "ROLE"
						}
					});

					stepScope.ctrl.selectedType = 'USER';
					stepScope.$digest();

					expect(step.stepApprovers.length).toBe(0);

					stepScope.ctrl.stepApprovers = {
						USER: [{
							value: 'USER234'
						}],
						TEAMOB: undefined,
						ROLE: undefined
					};
					stepScope.$digest();

					expect(step.stepApprovers.length).toBe(1);
					expect(step.stepApprovers).toContain({
						objCode: 'SPAPVR',
						userID: 'USER234'
					});

					stepScope.ctrl.selectedType = 'TEAMOB';
					stepScope.$digest();

					expect(step.stepApprovers.length).toBe(0);

					stepScope.ctrl.stepApprovers = {
						USER: [],
						TEAMOB: {
							value: 'TEAMOB2345'
						},
						ROLE: undefined
					};
					stepScope.$digest();

					expect(step.stepApprovers.length).toBe(1);
					expect(step.stepApprovers).toContain({
						objCode: 'SPAPVR',
						teamID: 'TEAMOB2345'
					});
				});
			});
		});
	});
});
